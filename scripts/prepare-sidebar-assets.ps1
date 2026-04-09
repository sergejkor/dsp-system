$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Test-BackgroundPixel {
  param(
    [System.Drawing.Color]$Color
  )

  $max = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
  $min = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
  $brightness = ($Color.R + $Color.G + $Color.B) / 3.0
  $neutral = ($max - $min) -lt 28

  return ($brightness -ge 186 -and $neutral)
}

function Get-TransparentAlpha {
  param(
    [System.Drawing.Color]$Color
  )

  $max = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
  $min = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
  $brightness = ($Color.R + $Color.G + $Color.B) / 3.0
  $spread = $max - $min

  if ($brightness -ge 220 -and $spread -le 132) {
    return 0
  }

  if ($brightness -ge 204 -and $spread -le 120) {
    return [Math]::Max(0, [Math]::Min(255, [int](255 - (($brightness - 204) * 15))))
  }

  if ($brightness -ge 186 -and $spread -le 92) {
    return [Math]::Max(0, [Math]::Min(255, [int](255 - (($brightness - 186) * 9))))
  }

  return $Color.A
}

function Convert-LeitCoreLogoToTransparent {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  $src = [System.Drawing.Bitmap]::FromFile($SourcePath)

  try {
    $bmp = New-Object System.Drawing.Bitmap($src.Width, $src.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bmp)

    try {
      $graphics.DrawImage($src, 0, 0, $src.Width, $src.Height)
    }
    finally {
      $graphics.Dispose()
    }

    $width = $bmp.Width
    $height = $bmp.Height

    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        $color = $bmp.GetPixel($x, $y)
        $alpha = Get-TransparentAlpha -Color $color

        if ($alpha -ne $color.A) {
          $bmp.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($alpha, $color.R, $color.G, $color.B))
        }
      }
    }

    $minX = $width
    $minY = $height
    $maxX = -1
    $maxY = -1

    for ($y = 0; $y -lt $height; $y++) {
      for ($x = 0; $x -lt $width; $x++) {
        $pixel = $bmp.GetPixel($x, $y)

        if ($pixel.A -gt 18) {
          if ($x -lt $minX) { $minX = $x }
          if ($y -lt $minY) { $minY = $y }
          if ($x -gt $maxX) { $maxX = $x }
          if ($y -gt $maxY) { $maxY = $y }
        }
      }
    }

    if ($maxX -lt 0 -or $maxY -lt 0) {
      throw 'Transparent logo bounds not found.'
    }

    $padding = 6
    $cropX = [Math]::Max(0, $minX - $padding)
    $cropY = [Math]::Max(0, $minY - $padding)
    $cropW = [Math]::Min($width - $cropX, ($maxX - $minX + 1) + ($padding * 2))
    $cropH = [Math]::Min($height - $cropY, ($maxY - $minY + 1) + ($padding * 2))
    $rect = [System.Drawing.Rectangle]::new($cropX, $cropY, $cropW, $cropH)
    $cropped = $bmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

    try {
      $targetWidth = 340
      $targetHeight = [int][Math]::Round($cropped.Height * ($targetWidth / [double]$cropped.Width))
      $scaled = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $scaledGraphics = [System.Drawing.Graphics]::FromImage($scaled)

      try {
        $scaledGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $scaledGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $scaledGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $scaledGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $scaledGraphics.Clear([System.Drawing.Color]::Transparent)
        $scaledGraphics.DrawImage($cropped, 0, 0, $targetWidth, $targetHeight)
      }
      finally {
        $scaledGraphics.Dispose()
      }

      $scaled.Save($TargetPath, [System.Drawing.Imaging.ImageFormat]::Png)
      $scaled.Dispose()
    }
    finally {
      $cropped.Dispose()
    }

    $bmp.Dispose()
  }
  finally {
    $src.Dispose()
  }
}

function Convert-SidebarBackgroundToJpeg {
  param(
    [string]$SourcePath,
    [string]$TargetPath
  )

  $src = [System.Drawing.Bitmap]::FromFile($SourcePath)

  try {
    $targetWidth = 700
    $targetHeight = [int][Math]::Round($src.Height * ($targetWidth / [double]$src.Width))
    $resized = New-Object System.Drawing.Bitmap($targetWidth, $targetHeight)
    $graphics = [System.Drawing.Graphics]::FromImage($resized)

    try {
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($src, 0, 0, $targetWidth, $targetHeight)
    }
    finally {
      $graphics.Dispose()
    }

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $encoder = [System.Drawing.Imaging.Encoder]::Quality
    $parameters = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $parameters.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter($encoder, [long]72)

    try {
      $resized.Save($TargetPath, $codec, $parameters)
    }
    finally {
      $resized.Dispose()
    }
  }
  finally {
    $src.Dispose()
  }
}

$workspace = Split-Path -Parent $PSScriptRoot

Convert-LeitCoreLogoToTransparent `
  -SourcePath (Join-Path $workspace 'frontend\src\assets\leitcore-logo-source.png') `
  -TargetPath (Join-Path $workspace 'frontend\src\assets\leitcore-logo-transparent.png')

Convert-SidebarBackgroundToJpeg `
  -SourcePath (Join-Path $workspace 'frontend\public\images\leitcore-network-dark.png') `
  -TargetPath (Join-Path $workspace 'frontend\public\images\leitcore-sidebar-dark.jpg')
