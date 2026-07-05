# Generates the FitTrack app icon: a bold "FT" monogram in the app's green
# on a black background.
# Run from repo root: powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function Add-RoundedRect {
  param($path, [double]$x, [double]$y, [double]$w, [double]$h, [double]$r)
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
}

function New-Mark {
  param([int]$size, [string]$outPath)

  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 8, 8, 10))

  $s = $size / 1024.0
  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)),
    (New-Object System.Drawing.PointF(0, $size)),
    [System.Drawing.Color]::FromArgb(255, 63, 232, 115),
    [System.Drawing.Color]::FromArgb(255, 8, 195, 67)
  )

  # F: vertical stem, top bar, shorter middle bar. T: top bar, centered stem.
  $bars = @(
    @(182, 232, 90, 560, 20),
    @(182, 232, 300, 90, 20),
    @(182, 472, 220, 80, 16),
    @(542, 232, 300, 90, 20),
    @(647, 232, 90, 560, 20)
  )
  foreach ($b in $bars) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    Add-RoundedRect $path ($b[0] * $s) ($b[1] * $s) ($b[2] * $s) ($b[3] * $s) ($b[4] * $s)
    $g.FillPath($brush, $path)
    $path.Dispose()
  }

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

New-Mark -size 1024 -outPath (Join-Path $iconsDir "icon-1024.png")
New-Mark -size 512 -outPath (Join-Path $iconsDir "icon-512.png")
New-Mark -size 192 -outPath (Join-Path $iconsDir "icon-192.png")
New-Mark -size 180 -outPath (Join-Path $iconsDir "apple-touch-icon.png")

Write-Host "Icons regenerated."
