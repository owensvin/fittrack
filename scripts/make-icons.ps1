# Generates the FitTrack app icon: an interlocked ribbon "X" mark in light
# blue on a black background (no grid lines).
# Run from repo root: powershell -File scripts/make-icons.ps1
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$iconsDir = Join-Path $root "icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

function New-Mark {
  param([int]$size, [string]$outPath)

  $bmp = New-Object System.Drawing.Bitmap($size, $size)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.Clear([System.Drawing.Color]::FromArgb(255, 9, 9, 11))

  $blue = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 110, 168, 240))
  $s = $size / 1024.0
  $c = 512 * $s

  # geometry (unrotated, horizontal ribbon centered on c)
  $half = (620 * $s) / 2   # half ribbon length
  $w = (150 * $s) / 2      # half ribbon width
  $d = 62 * $s             # V-notch depth at the ends
  $gap = 118 * $s          # half-gap where the split ribbon yields to the full one

  function Fill-Rot {
    param($pts, [double]$angle)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddPolygon([System.Drawing.PointF[]]$pts)
    $m = New-Object System.Drawing.Drawing2D.Matrix
    $m.RotateAt($angle, (New-Object System.Drawing.PointF($c, $c)))
    $path.Transform($m)
    $g.FillPath($blue, $path)
    $path.Dispose(); $m.Dispose()
  }

  # diagonal 1 (45deg): one continuous ribbon, V-notched at both ends
  Fill-Rot @(
    (New-Object System.Drawing.PointF(($c - $half), ($c - $w))),
    (New-Object System.Drawing.PointF(($c + $half), ($c - $w))),
    (New-Object System.Drawing.PointF(($c + $half - $d), $c)),
    (New-Object System.Drawing.PointF(($c + $half), ($c + $w))),
    (New-Object System.Drawing.PointF(($c - $half), ($c + $w))),
    (New-Object System.Drawing.PointF(($c - $half + $d), $c))
  ) 45

  # diagonal 2 (-45deg): split into two segments so ribbon 1 appears to pass over
  Fill-Rot @(
    (New-Object System.Drawing.PointF(($c + $gap), ($c - $w))),
    (New-Object System.Drawing.PointF(($c + $half), ($c - $w))),
    (New-Object System.Drawing.PointF(($c + $half - $d), $c)),
    (New-Object System.Drawing.PointF(($c + $half), ($c + $w))),
    (New-Object System.Drawing.PointF(($c + $gap), ($c + $w)))
  ) -45
  Fill-Rot @(
    (New-Object System.Drawing.PointF(($c - $gap), ($c - $w))),
    (New-Object System.Drawing.PointF(($c - $half), ($c - $w))),
    (New-Object System.Drawing.PointF(($c - $half + $d), $c)),
    (New-Object System.Drawing.PointF(($c - $half), ($c + $w))),
    (New-Object System.Drawing.PointF(($c - $gap), ($c + $w)))
  ) -45

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose(); $bmp.Dispose()
}

New-Mark -size 1024 -outPath (Join-Path $iconsDir "icon-1024.png")
New-Mark -size 512 -outPath (Join-Path $iconsDir "icon-512.png")
New-Mark -size 192 -outPath (Join-Path $iconsDir "icon-192.png")
New-Mark -size 180 -outPath (Join-Path $iconsDir "apple-touch-icon.png")

Write-Host "Icons regenerated."
