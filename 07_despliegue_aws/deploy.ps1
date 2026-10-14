# =====================================================================
# deploy.ps1 · Publishes the website (frontend/ folder) to S3 + CloudFront
# ---------------------------------------------------------------------
# ONLY the WEBSITE. The API is deployed separately with: sam build + sam deploy
#
# STEPS
#   1. Read the bucket and the distribution from the CloudFormation stack
#   2. Check that config.js points to this stack's API
#   3. Upload the files to S3 with the right content type
#   4. Invalidate the CloudFront cache and wait for it to finish
#
# USAGE (from the 07_despliegue_aws folder):
#   .\deploy.ps1
# Requirement: AWS CLI configured (aws configure)
# =====================================================================

# param(): parameters with default values, like the arguments of a
# Python function. E.g.: .\deploy.ps1 -StackName another-stack
param(
    [string]$StackName = "scoring-riesgos-demo",
    [string]$Region    = "eu-central-1"
)

# Stop the script on any PowerShell error
$ErrorActionPreference = "Stop"

# Always work from the script's folder ($PSScriptRoot), wherever it is
# launched from: this way the "frontend" path is always correct
Set-Location $PSScriptRoot
$Carpeta = "frontend"

# External programs (aws.exe) do NOT trigger $ErrorActionPreference:
# their result is checked in $LASTEXITCODE (0 = all good). This function
# is called after each aws command and stops the script if something failed.
function Comprobar([string]$Paso) {
    if ($LASTEXITCODE -ne 0) { throw "Ha fallado: $Paso (código $LASTEXITCODE)" }
}


# ---------------------------------------------------------------------
# 1. READ THE STACK OUTPUTS
# ---------------------------------------------------------------------
# Instead of hard-coding the bucket and distribution names, they are
# requested from CloudFormation: if the stack is ever recreated (and the
# names change), the script keeps working without changes.
#   --query  filters the JSON response (JMESPath syntax)
#   ConvertFrom-Json  turns the JSON text into PowerShell objects
Write-Host "1/4 Leyendo los recursos del stack $StackName..." -ForegroundColor Cyan
$Salidas = aws cloudformation describe-stacks --stack-name $StackName --region $Region `
    --query "Stacks[0].Outputs" --output json | ConvertFrom-Json
Comprobar "leer el stack"

# Finds an Output by its name (like filtering a DataFrame by a column)
function Salida([string]$Clave) { ($Salidas | Where-Object OutputKey -eq $Clave).OutputValue }
$ApiUrl = Salida "ApiUrl"
$WebUrl = Salida "WebUrl"
$Bucket = Salida "WebBucketName"
$DistId = Salida "DistributionId"
Write-Host "    Bucket: $Bucket | Distribucion: $DistId"


# ---------------------------------------------------------------------
# 2. CHECK config.js
# ---------------------------------------------------------------------
# Safety net: if the API had been recreated with another URL and
# config.js was not updated, the published website would not work. Better
# to stop here with a clear message than to publish a broken website.
Write-Host "2/4 Comprobando config.js..." -ForegroundColor Cyan
if (-not (Select-String -Path "$Carpeta\config.js" -SimpleMatch $ApiUrl -Quiet)) {
    throw "config.js no contiene la ApiUrl del stack ($ApiUrl). Actualiza API_AWS antes de publicar."
}


# ---------------------------------------------------------------------
# 3. UPLOAD THE WEBSITE TO S3
# ---------------------------------------------------------------------
# Content-Type: tells the browser WHAT each file is. aws s3 sync guesses
# it from the extension, but on Windows it takes it from the system
# registry and sometimes gets it wrong (e.g. .js as text/plain). That is
# why it is set explicitly, type by type, with charset=utf-8 for text
# (accents, the «ü» in antigüedad and the «€»).
#
# Cache-Control "max-age=300": browsers and CloudFront may reuse
# each file for 5 minutes before asking again. A balance between
# speed and changes arriving soon (the invalidation in step 4
# clears CloudFront instantly; browsers, within 5 min at most).
Write-Host "3/4 Subiendo la web a S3..." -ForegroundColor Cyan
$Tipos = [ordered]@{
    "*.html" = "text/html; charset=utf-8"
    "*.css"  = "text/css; charset=utf-8"
    "*.js"   = "text/javascript; charset=utf-8"
    "*.svg"  = "image/svg+xml"
    "*.png"  = "image/png"
    "*.jpg"  = "image/jpeg"
}
$Cache = "public, max-age=300"

# 3.1 One sync per type: --exclude "*" --include "*.css" = "only the .css files"
#     sync only uploads what has changed (compares size and date)
foreach ($Patron in $Tipos.Keys) {
    aws s3 sync $Carpeta "s3://$Bucket" --region $Region --no-progress `
        --exclude "*" --include $Patron `
        --content-type $Tipos[$Patron] --cache-control $Cache
    Comprobar "subir $Patron"
}

# 3.2 Final sync with --delete: removes from the bucket whatever no longer
#     exists in frontend/ (e.g. a renamed file, like bander-es.svg)
aws s3 sync $Carpeta "s3://$Bucket" --region $Region --no-progress --delete --cache-control $Cache
Comprobar "sincronizar borrados"


# ---------------------------------------------------------------------
# 4. INVALIDATE THE CLOUDFRONT CACHE
# ---------------------------------------------------------------------
# CloudFront keeps copies of the files on its servers. The
# "/*" invalidation tells it: "forget all your copies and request them
# again from S3". The first 1,000 paths per month are free, and "/*"
# counts as a single path.
# CloudFront is a GLOBAL service: that is why it has no --region.
Write-Host "4/4 Invalidando la cache de CloudFront (tarda 1-2 min)..." -ForegroundColor Cyan
$InvId = aws cloudfront create-invalidation --distribution-id $DistId --paths "/*" `
    --query "Invalidation.Id" --output text
Comprobar "crear la invalidacion"

# Wait for it to finish, so the new version is shown when opening the website
aws cloudfront wait invalidation-completed --distribution-id $DistId --id $InvId
Comprobar "esperar la invalidacion"

Write-Host ""
Write-Host "Web publicada: $WebUrl" -ForegroundColor Green