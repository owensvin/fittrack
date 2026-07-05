# Generates the FitTrack app icon: a bold "FT" wordmark in Segoe UI, in the
# app's green on a black background.
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
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(255, 8, 8, 10))

  $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    (New-Object System.Drawing.PointF(0, 0)),
    (New-Object System.Drawing.PointF(0, $size)),
    [System.Drawing.Color]::FromArgb(255, 63, 232, 115),
    [System.Drawing.Color]::FromArgb(255, 8, 195, 67)
  )

  $font = New-Object System.Drawing.Font("Segoe UI", ($size * 0.46), [System.Drawing.FontStyle]::Bold)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = [System.Drawing.StringAlignment]::Center
  $fmt.LineAlignment = [System.Drawing.StringAlignment]::Center
  $rect = New-Object System.Drawing.RectangleF(0, 0, $size, $size)
  $g.DrawString("FT", $font, $brush, $rect, $fmt)

  $bmp.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $font.Dispose(); $brush.Dispose(); $g.Dispose(); $bmp.Dispose()
}

New-Mark -size 1024 -outPath (Join-Path $iconsDir "icon-1024.png")
New-Mark -size 512 -outPath (Join-Path $iconsDir "icon-512.png")
New-Mark -size 192 -outPath (Join-Path $iconsDir "icon-192.png")
New-Mark -size 180 -outPath (Join-Path $iconsDir "apple-touch-icon.png")

Write-Host "Icons regenerated."
