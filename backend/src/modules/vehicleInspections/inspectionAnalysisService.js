import sharp from 'sharp';
import analysisRepository from './vehicleInspectionAnalysisRepository.js';
import { getCvConfig } from './cv/cvConfig.js';
import qualityGate from './cv/qualityGate.js';
import vehicleRegionEstimator from './cv/vehicleRegionEstimator.js';
import alignmentEngine from './cv/alignmentEngine.js';
import zoneProvider from './cv/zoneProvider.js';
import zoneComparator from './cv/comparison.js';
import candidateExtractor from './cv/candidateExtractor.js';
import reflectionSuppressor from './cv/reflectionSuppressor.js';
import DamageHistoryMatcher from './cv/damageHistoryMatcher.js';
import damageReasoner from './cv/reasoner.js';
import debugArtifactStorage from './cv/storage.js';
import damageEventPublisher from './cv/eventPublisher.js';
import { bboxToNormalized, loadImageData, round, toGray } from './cv/utils.js';

const REQUIRED_SHOT_TYPES = [
  'front_left',
  'left_side',
  'rear_left',
  'rear',
  'rear_right',
  'right_side',
  'front_right',
  'front',
];

async function preparePhotoForAnalysis(photo, vehicleType) {
  const config = getCvConfig(vehicleType);
  const metadata = await sharp(photo.file_content, { failOn: 'none' }).rotate().metadata().catch(() => ({}));
  const analysisImage = await loadImageData(photo.file_content, {
    width: config.analysisWidth,
    height: config.analysisHeight,
    fit: 'contain',
  });
  return {
    ...photo,
    metadata: {
      width: metadata.width || analysisImage.width,
      height: metadata.height || analysisImage.height,
    },
    analysisImage: {
      ...analysisImage,
      originalWidth: metadata.width || analysisImage.width,
      originalHeight: metadata.height || analysisImage.height,
    },
    grayImage: {
      data: toGray(analysisImage),
      width: analysisImage.width,
      height: analysisImage.height,
    },
  };
}

function buildPhotoMap(photos) {
  return new Map((photos || []).map((photo) => [photo.shot_type, photo]));
}

function computeShotStatus(quality, alignment, candidates, baselineMode) {
  if (!quality.passed) return 'quality_failed';
  const reviewCandidates = (candidates || []).filter((candidate) => candidate.label !== 'likely_false_positive');
  if (baselineMode) {
    return reviewCandidates.length ? 'baseline_review_required' : 'baseline_only';
  }
  if (!alignment.success && reviewCandidates.length) return 'comparison_uncertain';
  if (reviewCandidates.some((candidate) => candidate.label === 'likely_new_damage')) return 'review_required';
  if (reviewCandidates.some((candidate) => candidate.label === 'uncertain' || candidate.label === 'existing_damage_changed')) return 'review_required';
  return 'clear';
}

function summarizeShots(shots, referenceInspectionId) {
  const qualityIssues = shots.filter((shot) => !shot.quality?.passed).length;
  const allCandidates = shots.flatMap((shot) => shot.candidates || []);
  const newDamageCandidates = allCandidates.filter((candidate) => candidate.label === 'likely_new_damage').length;
  const existingDamageMatches = allCandidates.filter((candidate) => candidate.label === 'likely_existing_damage').length;
  const existingDamageChanged = allCandidates.filter((candidate) => candidate.label === 'existing_damage_changed').length;
  const uncertainCandidates = allCandidates.filter((candidate) => candidate.label === 'uncertain').length;
  const baselineMode = !referenceInspectionId;
  const reviewRequired = qualityIssues > 0 || allCandidates.some((candidate) => candidate.label !== 'likely_false_positive');

  return {
    status: baselineMode
      ? (reviewRequired ? 'baseline_review_required' : 'baseline_only')
      : (reviewRequired ? 'review_required' : 'clear'),
    baselineInspectionId: referenceInspectionId ? String(referenceInspectionId) : null,
    qualityIssues,
    newDamageCandidates,
    existingDamageMatches,
    existingDamageChanged,
    uncertainCandidates,
    reviewedCandidateCount: allCandidates.length,
    comparedShotCount: shots.filter((shot) => shot.referencePhotoId).length,
    missingReferenceShotCount: shots.filter((shot) => !shot.referencePhotoId).length,
    missingBaselineShotCount: shots.filter((shot) => !shot.referencePhotoId).length,
    reviewRequired,
  };
}

function deriveApproval(summary) {
  if (summary.status === 'clear') {
    return {
      reviewStatus: 'auto_approved',
      reviewRequired: false,
      approvedForReference: true,
      compatibilityOverallResult: 'no_new_damage',
    };
  }
  if (summary.status === 'baseline_only') {
    return {
      reviewStatus: 'auto_approved_baseline',
      reviewRequired: false,
      approvedForReference: true,
      compatibilityOverallResult: 'baseline_created',
    };
  }
  return {
    reviewStatus: 'pending_review',
    reviewRequired: true,
    approvedForReference: false,
    compatibilityOverallResult: summary.newDamageCandidates > 0 ? 'possible_new_damage' : 'baseline_created',
  };
}

function normalizeFinalCandidates(candidates, image) {
  return (candidates || []).map((candidate) => ({
    ...candidate,
    zone: candidate.zoneName,
    bbox: {
      x: Math.round(candidate.bbox.x),
      y: Math.round(candidate.bbox.y),
      w: Math.round(candidate.bbox.w),
      h: Math.round(candidate.bbox.h),
    },
    normalizedBbox: bboxToNormalized(candidate.bbox, image.width, image.height),
    confidence: round(candidate.confidence, 6),
    comparisonScore: round(candidate.comparisonScore, 6),
    overlapWithHistory: round(candidate.overlapWithHistory || 0, 6),
    debug: {
      ...(candidate.debug || {}),
      normalizedBbox: bboxToNormalized(candidate.bbox, image.width, image.height),
    },
  }));
}

export class InspectionAnalysisService {
  constructor(options = {}) {
    this.repository = options.repository || analysisRepository;
    this.historyMatcher = options.historyMatcher || new DamageHistoryMatcher(this.repository);
    this.qualityGate = options.qualityGate || qualityGate;
    this.regionEstimator = options.regionEstimator || vehicleRegionEstimator;
    this.alignmentEngine = options.alignmentEngine || alignmentEngine;
    this.zoneProvider = options.zoneProvider || zoneProvider;
    this.zoneComparator = options.zoneComparator || zoneComparator;
    this.candidateExtractor = options.candidateExtractor || candidateExtractor;
    this.reflectionSuppressor = options.reflectionSuppressor || reflectionSuppressor;
    this.damageReasoner = options.damageReasoner || damageReasoner;
    this.debugStorage = options.debugStorage || debugArtifactStorage;
    this.eventPublisher = options.eventPublisher || damageEventPublisher;
  }

  async analyzeInspection(inspectionId, options = {}) {
    await this.repository.ensureTables();
    const bundle = await this.repository.getInspectionBundle(inspectionId);
    if (!bundle?.inspection) {
      throw new Error('Inspection not found');
    }

    const inspection = bundle.inspection;
    const vehicleType = String(inspection.inspection_vehicle_type || '').trim();
    if (!vehicleType) {
      throw new Error('inspection_vehicle_type is required');
    }

    const currentMap = buildPhotoMap(bundle.photos);
    const missingShots = REQUIRED_SHOT_TYPES.filter((shotType) => !currentMap.has(shotType));
    if (missingShots.length) {
      throw new Error(`Inspection is missing required shots: ${missingShots.join(', ')}`);
    }

    const preparedCurrentPhotos = new Map();
    for (const shotType of REQUIRED_SHOT_TYPES) {
      preparedCurrentPhotos.set(
        shotType,
        await preparePhotoForAnalysis(currentMap.get(shotType), vehicleType),
      );
    }

    const referenceBundle = await this.repository.findReferenceInspection(inspection);
    const referenceMap = buildPhotoMap(referenceBundle?.photos || []);
    const preparedReferencePhotos = new Map();
    if (referenceBundle?.photos?.length) {
      for (const shotType of REQUIRED_SHOT_TYPES) {
        if (!referenceMap.has(shotType)) continue;
        preparedReferencePhotos.set(
          shotType,
          await preparePhotoForAnalysis(referenceMap.get(shotType), vehicleType),
        );
      }
    }

    const shotResults = [];
    try {
      for (const shotType of REQUIRED_SHOT_TYPES) {
        const currentPhoto = preparedCurrentPhotos.get(shotType);
        const referencePhoto = preparedReferencePhotos.get(shotType) || null;
        const baselineMode = !referencePhoto;
        const quality = this.qualityGate.analyze(currentPhoto.analysisImage, vehicleType, shotType);
        const currentRegion = this.regionEstimator.estimate(currentPhoto.analysisImage, vehicleType, shotType);
        const zones = this.zoneProvider.getZones(vehicleType, shotType, {
          width: currentPhoto.analysisImage.width,
          height: currentPhoto.analysisImage.height,
        });

        let alignment = {
          success: false,
          alignmentScore: 0,
          methodUsed: 'baseline_only',
          numGoodMatches: 0,
        };
        let referenceGrayImage = null;
        let currentGrayImage = currentPhoto.grayImage;

        if (!baselineMode) {
          alignment = await this.alignmentEngine.align(
            referencePhoto.analysisImage,
            currentPhoto.analysisImage,
            vehicleType,
            shotType,
          );
          referenceGrayImage = referencePhoto.grayImage;
          currentGrayImage = {
            data: alignment.alignedCurrentGray,
            width: referencePhoto.analysisImage.width,
            height: referencePhoto.analysisImage.height,
          };
        }

        let zoneResults = baselineMode
          ? this.zoneComparator.scanSingleImage(currentGrayImage, zones, vehicleType)
          : this.zoneComparator.compare(referenceGrayImage, currentGrayImage, zones, vehicleType);

        let candidates = this.candidateExtractor.extract(zoneResults, vehicleType, shotType);
        candidates = normalizeFinalCandidates(candidates, currentGrayImage);
        candidates = this.reflectionSuppressor.refine(referenceGrayImage, currentGrayImage, candidates, vehicleType, shotType);
        if (!baselineMode) {
          candidates = await this.historyMatcher.match(inspection.vehicle_id || inspection.car_id, shotType, candidates, vehicleType);
        }
        candidates = this.damageReasoner.classify(quality, alignment, candidates, vehicleType, shotType, { baselineMode });
        candidates = normalizeFinalCandidates(candidates, currentGrayImage);

        const reviewableCandidates = candidates.filter((candidate) => candidate.label !== 'likely_false_positive');
        const debugOverlayPath = reviewableCandidates.length
          ? await this.debugStorage.saveCandidateOverlay(inspection.id, shotType, currentPhoto.analysisImage, reviewableCandidates)
          : null;

        shotResults.push({
          shotType,
          inspectionPhotoId: currentPhoto.id,
          referencePhotoId: referencePhoto?.id || null,
          quality,
          alignment,
          status: computeShotStatus(quality, alignment, candidates, baselineMode),
          candidates: candidates.map((candidate) => ({
            zone: candidate.zone,
            bbox: candidate.bbox,
            label: candidate.label,
            confidence: candidate.confidence,
            comparisonScore: candidate.comparisonScore,
            overlapWithHistory: candidate.overlapWithHistory || 0,
            reasonCodes: candidate.reasonCodes || [],
            normalizedBbox: candidate.normalizedBbox,
            debug: candidate.debug,
            status: 'candidate',
            reviewerStatus: null,
            area: candidate.area,
          })),
          debug: {
            shotType,
            baselineMode,
            debugOverlayPath,
            vehicleRegion: currentRegion.vehicleBbox,
            vehicleRegionConfidence: currentRegion.confidence,
            alignment: {
              method: alignment.methodUsed,
              score: alignment.alignmentScore,
              goodMatches: alignment.numGoodMatches,
            },
            qualityWarnings: quality.warnings,
            qualityFailReasons: quality.failReasons,
          },
        });
      }

      const summary = summarizeShots(shotResults, referenceBundle?.inspection?.id || null);
      const approval = deriveApproval(summary);
      const analysisResult = {
        inspectionId: String(inspection.id),
        vehicleId: String(inspection.vehicle_id || inspection.car_id || ''),
        vehicleType,
        referenceInspectionId: referenceBundle?.inspection?.id ? String(referenceBundle.inspection.id) : null,
        summary,
        shots: shotResults,
        reviewStatus: approval.reviewStatus,
        reviewRequired: approval.reviewRequired,
        approvedForReference: approval.approvedForReference,
        compatibilityOverallResult: approval.compatibilityOverallResult,
        reviewedByUserId: approval.approvedForReference ? options.userId || null : null,
      };

      const stored = await this.repository.saveAnalysis(analysisResult);
      if (summary.newDamageCandidates > 0) {
        await this.eventPublisher.publishNewDamageEvent(
          analysisResult.vehicleId,
          analysisResult.inspectionId,
          summary.newDamageCandidates,
          summary,
        );
      }
      return stored;
    } catch (error) {
      await this.repository.markAnalysisFailed(inspection.id, error?.message || error);
      throw error;
    }
  }
}

export default new InspectionAnalysisService();
