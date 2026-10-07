$videos = @(
    @{ id = "P1_TGLibPR0"; name = "Anastasiz" },
    @{ id = "bg-Y0I8rRFc"; name = "Kuplinov" },
    @{ id = "ovIxZKkdqSY"; name = "Windy31" },
    @{ id = "WZmyc5iLCtY"; name = "Maslennikov" },
    @{ id = "JrGvbX5vV9c"; name = "Wylsacom" },
    @{ id = "XEZPStdB78s"; name = "Marmok" },
    @{ id = "UfCL9xrZRS8"; name = "Deepins" },
    @{ id = "ngNl_XaIOs8"; name = "Vpiska" }
)

$thumbnailsDir = Join-Path $PSScriptRoot "..\public\assets\thumbnails"
$avatarsDir = Join-Path $PSScriptRoot "..\public\assets\avatars"

if (!(Test-Path $thumbnailsDir)) { New-Item -ItemType Directory -Path $thumbnailsDir -Force }
if (!(Test-Path $avatarsDir)) { New-Item -ItemType Directory -Path $avatarsDir -Force }

# Configure SecurityProtocol just in case
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 -bor [Net.SecurityProtocolType]::Tls13

foreach ($v in $videos) {
    Write-Host "------------------------------------"
    Write-Host "Processing $($v.name) ($($v.id))..."

    # 1. Download thumbnail
    $thumbUrl = "https://i.ytimg.com/vi/$($v.id)/hqdefault.jpg"
    $thumbPath = Join-Path $thumbnailsDir "$($v.id).jpg"
    try {
        Write-Host "Downloading thumbnail from $thumbUrl..."
        Invoke-WebRequest -Uri $thumbUrl -OutFile $thumbPath -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -TimeoutSec 15
        Write-Host "Successfully saved thumbnail to $thumbPath"
    } catch {
        Write-Error "Failed to download thumbnail: $_"
    }

    # 2. Find and download avatar
    try {
        Write-Host "Fetching oembed for author_url..."
        $oembedUrl = "https://noembed.com/embed?url=https://www.youtube.com/watch?v=$($v.id)"
        $oembed = Invoke-RestMethod -Uri $oembedUrl -UserAgent "Mozilla/5.0" -TimeoutSec 10
        $authorUrl = $oembed.author_url

        if (!$authorUrl) {
            throw "No author_url in oembed response"
        }
        Write-Host "Author channel URL: $authorUrl"

        # Fetch channel HTML
        $html = Invoke-RestMethod -Uri $authorUrl -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36" -TimeoutSec 15
        
        $avatarUrl = $null
        # Match using regex
        if ($html -match '"avatar":\{"thumbnails":\[.*?"url":"(https://yt3\.ggpht\.com/[^"]+)"') {
            $avatarUrl = $Matches[1]
        } else {
            # Try general search
            if ($html -match '(https://yt3\.ggpht\.com/[a-zA-Z0-9_-]+=[sS]\d+[^"\s\\=\)\(]*)') {
                $avatarUrl = $Matches[1]
            }
        }

        if (!$avatarUrl) {
            # Try another regex
            if ($html -match 'https://yt3\.ggpht\.com/[a-zA-Z0-9_-]+') {
                $avatarUrl = $Matches[0]
            }
        }

        if (!$avatarUrl) {
            throw "Could not find avatar URL on channel page"
        }

        # Normalize URL (change size to s240)
        $avatarUrl = $avatarUrl -replace '=s\d+', '=s240'
        $avatarUrl = $avatarUrl -replace '=w\d+-h\d+', '=s240'
        
        # Clean escape chars if any
        $avatarUrl = $avatarUrl -replace '\\u0026', '&'
        $avatarUrl = $avatarUrl -replace '\\', ''

        Write-Host "Found avatar URL: $avatarUrl"
        $avatarPath = Join-Path $avatarsDir "$($v.id).jpg"
        
        Write-Host "Downloading avatar..."
        Invoke-WebRequest -Uri $avatarUrl -OutFile $avatarPath -UserAgent "Mozilla/5.0" -TimeoutSec 15
        Write-Host "Successfully saved avatar to $avatarPath"
    } catch {
        Write-Error "Failed to download avatar: $_"
        
        # Write a fallback SVG avatar
        $avatarPathSvg = Join-Path $avatarsDir "$($v.id).svg"
        $colors = @('#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#ef4444', '#06b6d4')
        $color = $colors[[int]($v.id[0]) % $colors.Count]
        $letter = $v.name[0].ToString().ToUpper()
        
        $svg = "<svg xmlns=`"http://www.w3.org/2000/svg`" width=`"100`" height=`"100`" viewBox=`"0 0 100 100`"><circle cx=`"50`" cy=`"50`" r=`"50`" fill=`"$color`"/><text x=`"50`" y=`"63`" font-size=`"44`" font-family=`"-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif`" font-weight=`"bold`" fill=`"#ffffff`" text-anchor=`"middle`">$letter</text></svg>"
        Set-Content -Path $avatarPathSvg -Value $svg -Force
        Write-Host "Created fallback SVG avatar at $avatarPathSvg"
    }
}

Write-Host "Done!"
