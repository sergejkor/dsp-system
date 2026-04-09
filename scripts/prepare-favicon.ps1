$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

function Test-BackgroundPixel {
  param(
    [System.Drawing.Color]$Color
  )

  $max = [Math]::Max($Color.R, [Math]::Max($Color.G, $Color.B))
  $min = [Math]::Min($Color.R, [Math]::Min($Color.G, $Color.B))
  $brightness = ($Color.R + $Color.G + $Color.B) / 3.0
  $neutral = ($max - $min) -lt 30

  return ($brightness -ge 205 -and $neutral)
}

$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace 'frontend\src\assets\favicon-source.png'
$target = Join-Path $workspace 'frontend\public\favicon-leitcore-v2.png'

$src = [System.Drawing.Bitmap]::FromFile($source)

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
  $visited = New-Object 'bool[,]' $width, $height
  $queue = New-Object 'System.Collections.Generic.Queue[System.Drawing.Point]'

  for ($x = 0; $x -lt $width; $x++) {
    $queue.Enqueue([System.Drawing.Point]::new($x, 0))
    $queue.Enqueue([System.Drawing.Point]::new($x, $height - 1))
  }

  for ($y = 1; $y -lt ($height - 1); $y++) {
    $queue.Enqueue([System.Drawing.Point]::new(0, $y))
    $queue.Enqueue([System.Drawing.Point]::new($width - 1, $y))
  }

  while ($queue.Count -gt 0) {
    $point = $queue.Dequeue()

    if ($point.X -lt 0 -or $point.Y -lt 0 -or $point.X -ge $width -or $point.Y -ge $height) {
      continue
    }

    if ($visited[$point.X, $point.Y]) {
      continue
    }

    $visited[$point.X, $point.Y] = $true
    $color = $bmp.GetPixel($point.X, $point.Y)

    if (-not (Test-BackgroundPixel -Color $color)) {
      continue
    }

    $bmp.SetPixel($point.X, $point.Y, [System.Drawing.Color]::FromArgb(0, $color.R, $color.G, $color.B))

    $queue.Enqueue([System.Drawing.Point]::new($point.X + 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X - 1, $point.Y))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y + 1))
    $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y - 1))
  }

  $minX = $width
  $minY = $height
  $maxX = -1
  $maxY = -1

  for ($y = 0; $y -lt $height; $y++) {
    for ($x = 0; $x -lt $width; $x++) {
      $pixel = $bmp.GetPixel($x, $y)

      if ($pixel.A -gt 20) {
        if ($x -lt $minX) { $minX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }

  if ($maxX -lt 0 -or $maxY -lt 0) {
    throw 'Icon bounds not found.'
  }

  $padding = 16
  $cropX = [Math]::Max(0, $minX - $padding)
  $cropY = [Math]::Max(0, $minY - $padding)
  $cropW = [Math]::Min($width - $cropX, ($maxX - $minX + 1) + ($padding * 2))
  $cropH = [Math]::Min($height - $cropY, ($maxY - $minY + 1) + ($padding * 2))
  $rect = [System.Drawing.Rectangle]::new($cropX, $cropY, $cropW, $cropH)
  $cropped = $bmp.Clone($rect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)

  try {
    $size = 64
    $canvas = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $canvasGraphics = [System.Drawing.Graphics]::FromImage($canvas)

    try {
      $canvasGraphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $canvasGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $canvasGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $canvasGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $canvasGraphics.Clear([System.Drawing.Color]::Transparent)

      $maxDim = [Math]::Max($cropped.Width, $cropped.Height)
      $drawSize = 56
      $scale = $drawSize / [double]$maxDim
      $drawW = [int][Math]::Round($cropped.Width * $scale)
      $drawH = [int][Math]::Round($cropped.Height * $scale)
      $offsetX = [int][Math]::Round(($size - $drawW) / 2)
      $offsetY = [int][Math]::Round(($size - $drawH) / 2)

      $canvasGraphics.DrawImage($cropped, $offsetX, $offsetY, $drawW, $drawH)
    }
    finally {
      $canvasGraphics.Dispose()
    }

    $canvas.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
    $canvas.Dispose()
  }
  finally {
    $cropped.Dispose()
  }

  $bmp.Dispose()
}
finally {
  $src.Dispose()
}
