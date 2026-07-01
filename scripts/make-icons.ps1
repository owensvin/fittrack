# Generates the FitTrack app icon: a blue barbell on a black background.
# Run from repo root: powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function New-Barbell {
  param([int]$size, [string]$outPath)

  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 8, 8, 10))

  $blue = [System.Drawing.Color]::FromArgb(255, 77, 157, 224)
  $blueDark = [System.Drawing.Color]::FromArgb(255, 42, 110, 168)
  $bar = [System.Drawing.Color]::FromArgb(255, 214, 216, 222)

  $s = $size / 1024.0
  $cy = 512 * $s

  # bar
  $barH = 40 * $s
  $barX1 = 300 * $s
  $barX2 = 724 * $s
  $barBrush = New-Object System.Drawing.SolidBrush($bar)
  $g.FillRectangle($barBrush, $barX1, $cy - $barH / 2, $barX2 - $barX1, $barH)

  # grips (darker bands near center)
  $gripBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 150, 152, 160))
  $g.FillRectangle($gripBrush, (512 * $s) - (60 * $s), $cy - $barH / 2 - 4 * $s, 6 * $s, $barH + 8 * $s)
  $g.FillRectangle($gripBrush, (512 * $s) + (54 * $s), $cy - $barH / 2 - 4 * $s, 6 * $s, $barH + 8 * $s)

  function Draw-PlateStack {
    param($cx)
    $plateBrushOuter = New-Object System.Drawing.SolidBrush($blueDark)
    $plateBrushInner = New-Object System.Drawing.SolidBrush($blue)
    $rOuter = 130 * $s
    $rInner = 88 * $s
    $g.FillEllipse($plateBrushOuter, $cx - $rOuter, $cy - $rOuter, $rOuter * 2, $rOuter * 2)
    $g.FillEllipse($plateBrushInner, $cx - $rInner, $cy - $rInner, $rInner * 2, $rInner * 2)
  }
  Draw-PlateStack -cx (222 * $s)
  Draw-PlateStack -cx (802 * $s)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Barbell -size 1024 -outPath (Join-Path $iconsDir "icon-1024.png")
New-Barbell -size 512 -outPath (Join-Path $iconsDir "icon-512.png")
New-Barbell -size 192 -outPath (Join-Path $iconsDir "icon-192.png")
New-Barbell -size 180 -outPath (Join-Path $iconsDir "apple-touch-icon.png")

Write-Host "Icons regenerated."
