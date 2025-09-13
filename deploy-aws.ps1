# ================================================
# AWS DEPLOYMENT SCRIPT FOR IMAGE GALLERY
# ================================================
# Run this script from Windows PowerShell as Administrator
# Make sure AWS CLI is installed and configured

param(
    [string]$Action = "deploy",
    [string]$Domain = "",
    [switch]$SkipInfrastructure = $false
)

Write-Host "🚀 Image Gallery AWS Deployment Script" -ForegroundColor Green
Write-Host "Action: $Action" -ForegroundColor Yellow

# Global variables that will be populated
$script:VPC_ID = ""
$script:SUBNET_1 = ""
$script:SUBNET_2 = ""
$script:EC2_SG = ""
$script:RDS_SG = ""
$script:REDIS_SG = ""
$script:BUCKET_NAME = ""
$script:INSTANCE_ID = ""
$script:PUBLIC_IP = ""
$script:DB_ENDPOINT = ""
$script:REDIS_ENDPOINT = ""

function Write-Status {
    param($Message, $Color = "Cyan")
    Write-Host "✓ $Message" -ForegroundColor $Color
}

function Write-Error {
    param($Message)
    Write-Host "❌ ERROR: $Message" -ForegroundColor Red
}

function Write-Warning {
    param($Message)
    Write-Host "⚠️  WARNING: $Message" -ForegroundColor Yellow
}

function Test-AWSCLIInstalled {
    try {
        $version = aws --version
        Write-Status "AWS CLI is installed: $version"
        return $true
    }
    catch {
        Write-Error "AWS CLI is not installed. Please install it first."
        return $false
    }
}

function Test-AWSCredentials {
    try {
        $identity = aws sts get-caller-identity --output text
        Write-Status "AWS credentials configured: $identity"
        return $true
    }
    catch {
        Write-Error "AWS credentials not configured. Run 'aws configure' first."
        return $false
    }
}

function New-AWSInfrastructure {
    Write-Host "`n🏗️  Creating AWS Infrastructure..." -ForegroundColor Green
    
    try {
        # Create VPC
        Write-Status "Creating VPC..."
        $vpcOutput = aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=image-gallery-vpc}]' --output json | ConvertFrom-Json
        $script:VPC_ID = $vpcOutput.Vpc.VpcId
        Write-Status "VPC created: $script:VPC_ID"

        # Create Internet Gateway
        Write-Status "Creating Internet Gateway..."
        $igwOutput = aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=image-gallery-igw}]' --output json | ConvertFrom-Json
        $IGW_ID = $igwOutput.InternetGateway.InternetGatewayId
        
        # Attach IGW to VPC
        aws ec2 attach-internet-gateway --vpc-id $script:VPC_ID --internet-gateway-id $IGW_ID
        Write-Status "Internet Gateway attached: $IGW_ID"

        # Create subnets
        Write-Status "Creating subnets..."
        $subnet1Output = aws ec2 create-subnet --vpc-id $script:VPC_ID --cidr-block 10.0.1.0/24 --availability-zone us-east-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=image-gallery-subnet-1}]' --output json | ConvertFrom-Json
        $script:SUBNET_1 = $subnet1Output.Subnet.SubnetId
        
        $subnet2Output = aws ec2 create-subnet --vpc-id $script:VPC_ID --cidr-block 10.0.2.0/24 --availability-zone us-east-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=image-gallery-subnet-2}]' --output json | ConvertFrom-Json
        $script:SUBNET_2 = $subnet2Output.Subnet.SubnetId
        Write-Status "Subnets created: $script:SUBNET_1, $script:SUBNET_2"

        # Create route table and routes
        Write-Status "Configuring routing..."
        $rtOutput = aws ec2 create-route-table --vpc-id $script:VPC_ID --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=image-gallery-rt}]' --output json | ConvertFrom-Json
        $RT_ID = $rtOutput.RouteTable.RouteTableId
        
        aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID
        aws ec2 associate-route-table --subnet-id $script:SUBNET_1 --route-table-id $RT_ID
        aws ec2 associate-route-table --subnet-id $script:SUBNET_2 --route-table-id $RT_ID
        
        # Enable auto-assign public IP
        aws ec2 modify-subnet-attribute --subnet-id $script:SUBNET_1 --map-public-ip-on-launch
        aws ec2 modify-subnet-attribute --subnet-id $script:SUBNET_2 --map-public-ip-on-launch

        # Create security groups
        Write-Status "Creating security groups..."
        $ec2sgOutput = aws ec2 create-security-group --group-name image-gallery-ec2-sg --description "Security group for Image Gallery EC2" --vpc-id $script:VPC_ID --output json | ConvertFrom-Json
        $script:EC2_SG = $ec2sgOutput.GroupId
        
        # Allow inbound traffic
        aws ec2 authorize-security-group-ingress --group-id $script:EC2_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
        aws ec2 authorize-security-group-ingress --group-id $script:EC2_SG --protocol tcp --port 443 --cidr 0.0.0.0/0
        aws ec2 authorize-security-group-ingress --group-id $script:EC2_SG --protocol tcp --port 22 --cidr 0.0.0.0/0
        
        # RDS security group
        $rdssgOutput = aws ec2 create-security-group --group-name image-gallery-rds-sg --description "Security group for Image Gallery RDS" --vpc-id $script:VPC_ID --output json | ConvertFrom-Json
        $script:RDS_SG = $rdssgOutput.GroupId
        aws ec2 authorize-security-group-ingress --group-id $script:RDS_SG --protocol tcp --port 5432 --source-group $script:EC2_SG
        
        # Redis security group
        $redissgOutput = aws ec2 create-security-group --group-name image-gallery-redis-sg --description "Security group for Image Gallery Redis" --vpc-id $script:VPC_ID --output json | ConvertFrom-Json
        $script:REDIS_SG = $redissgOutput.GroupId
        aws ec2 authorize-security-group-ingress --group-id $script:REDIS_SG --protocol tcp --port 6379 --source-group $script:EC2_SG

        Write-Status "Security groups created: EC2($script:EC2_SG), RDS($script:RDS_SG), Redis($script:REDIS_SG)"

        # Create S3 bucket
        Write-Status "Creating S3 bucket..."
        $script:BUCKET_NAME = "image-gallery-$(Get-Random -Minimum 1000 -Maximum 9999)-$(Get-Date -Format 'yyyyMMdd')"
        aws s3 mb "s3://$script:BUCKET_NAME" --region us-east-1
        
        # Configure S3 bucket
        $bucketPolicy = @"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$script:BUCKET_NAME/images/*/responsive/*"
        }
    ]
}
"@
        $bucketPolicy | Out-File -FilePath "bucket-policy.json" -Encoding UTF8
        aws s3api put-bucket-policy --bucket $script:BUCKET_NAME --policy file://bucket-policy.json
        
        aws s3api put-bucket-versioning --bucket $script:BUCKET_NAME --versioning-configuration Status=Enabled
        Write-Status "S3 bucket created and configured: $script:BUCKET_NAME"

        # Create RDS database
        Write-Status "Creating RDS database (this may take 10-15 minutes)..."
        aws rds create-db-subnet-group --db-subnet-group-name image-gallery-subnet-group --db-subnet-group-description "Subnet group for Image Gallery" --subnet-ids $script:SUBNET_1 $script:SUBNET_2
        
        aws rds create-db-instance `
            --db-instance-identifier image-gallery-db `
            --db-instance-class db.t3.micro `
            --engine postgres `
            --master-username postgres `
            --master-user-password 'TempPassword123!' `
            --allocated-storage 20 `
            --storage-type gp2 `
            --db-name image_gallery `
            --vpc-security-group-ids $script:RDS_SG `
            --db-subnet-group-name image-gallery-subnet-group `
            --backup-retention-period 7 `
            --storage-encrypted `
            --auto-minor-version-upgrade
        
        # Create Redis cluster
        Write-Status "Creating Redis cluster..."
        aws elasticache create-cache-subnet-group --cache-subnet-group-name image-gallery-cache-subnet --cache-subnet-group-description "Cache subnet group for Image Gallery" --subnet-ids $script:SUBNET_1 $script:SUBNET_2
        
        aws elasticache create-cache-cluster `
            --cache-cluster-id image-gallery-redis `
            --cache-node-type cache.t3.micro `
            --engine redis `
            --num-cache-nodes 1 `
            --security-group-ids $script:REDIS_SG `
            --cache-subnet-group-name image-gallery-cache-subnet

        Write-Status "AWS infrastructure creation initiated!"
        Write-Warning "RDS and Redis are being created in the background. This may take 10-15 minutes."

    }
    catch {
        Write-Error "Failed to create AWS infrastructure: $($_.Exception.Message)"
        return $false
    }
    
    return $true
}

function Wait-ForRDSAndRedis {
    Write-Host "`n⏳ Waiting for RDS and Redis to be available..." -ForegroundColor Green
    
    # Wait for RDS
    Write-Status "Waiting for RDS database..."
    do {
        Start-Sleep -Seconds 30
        $dbStatus = aws rds describe-db-instances --db-instance-identifier image-gallery-db --query 'DBInstances[0].DBInstanceStatus' --output text
        Write-Host "RDS Status: $dbStatus" -ForegroundColor Yellow
    } while ($dbStatus -ne "available")
    
    $script:DB_ENDPOINT = aws rds describe-db-instances --db-instance-identifier image-gallery-db --query 'DBInstances[0].Endpoint.Address' --output text
    Write-Status "RDS is available: $script:DB_ENDPOINT"
    
    # Wait for Redis
    Write-Status "Waiting for Redis cluster..."
    do {
        Start-Sleep -Seconds 30
        $redisStatus = aws elasticache describe-cache-clusters --cache-cluster-id image-gallery-redis --query 'CacheClusters[0].CacheClusterStatus' --output text
        Write-Host "Redis Status: $redisStatus" -ForegroundColor Yellow
    } while ($redisStatus -ne "available")
    
    $script:REDIS_ENDPOINT = aws elasticache describe-cache-clusters --cache-cluster-id image-gallery-redis --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text
    Write-Status "Redis is available: $script:REDIS_ENDPOINT"
}

function New-EC2Instance {
    Write-Host "`n🖥️  Launching EC2 instance..." -ForegroundColor Green
    
    try {
        # Create key pair
        Write-Status "Creating EC2 key pair..."
        aws ec2 create-key-pair --key-name image-gallery-key --query 'KeyMaterial' --output text | Out-File -FilePath "image-gallery-key.pem" -Encoding ASCII
        
        # Set permissions (Windows)
        icacls "image-gallery-key.pem" /inheritance:r
        icacls "image-gallery-key.pem" /grant:r "$env:USERNAME:(R)"
        
        # Create user data script
        $userData = @"
#!/bin/bash
yum update -y
yum install -y docker git

# Start Docker service
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/download/v2.21.0/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Clone repository
cd /home/ec2-user
git clone https://github.com/hash066/prompt-frame-gallery.git
chown -R ec2-user:ec2-user /home/ec2-user/prompt-frame-gallery

# Create logs directory
mkdir -p /home/ec2-user/prompt-frame-gallery/logs
chown ec2-user:ec2-user /home/ec2-user/prompt-frame-gallery/logs
"@
        $userData | Out-File -FilePath "user-data.sh" -Encoding UTF8
        
        # Get latest Amazon Linux 2 AMI
        $AMI_ID = aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text
        
        # Launch instance
        $instanceOutput = aws ec2 run-instances `
            --image-id $AMI_ID `
            --count 1 `
            --instance-type t3.medium `
            --key-name image-gallery-key `
            --security-group-ids $script:EC2_SG `
            --subnet-id $script:SUBNET_1 `
            --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=image-gallery-server}]' `
            --user-data file://user-data.sh `
            --output json | ConvertFrom-Json
            
        $script:INSTANCE_ID = $instanceOutput.Instances[0].InstanceId
        Write-Status "EC2 instance launched: $script:INSTANCE_ID"
        
        # Wait for instance to be running
        Write-Status "Waiting for instance to be running..."
        aws ec2 wait instance-running --instance-ids $script:INSTANCE_ID
        
        # Get public IP
        $script:PUBLIC_IP = aws ec2 describe-instances --instance-ids $script:INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
        Write-Status "Instance is running. Public IP: $script:PUBLIC_IP"
        
        return $true
    }
    catch {
        Write-Error "Failed to launch EC2 instance: $($_.Exception.Message)"
        return $false
    }
}

function New-IAMRoleForS3 {
    Write-Host "`n🔐 Creating IAM role for S3 access..." -ForegroundColor Green
    
    try {
        # Create trust policy
        $trustPolicy = @"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Service": "ec2.amazonaws.com"
            },
            "Action": "sts:AssumeRole"
        }
    ]
}
"@
        $trustPolicy | Out-File -FilePath "trust-policy.json" -Encoding UTF8
        
        aws iam create-role --role-name ImageGalleryS3Role --assume-role-policy-document file://trust-policy.json
        
        # Create S3 policy
        $s3Policy = @"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject",
                "s3:DeleteObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::$script:BUCKET_NAME",
                "arn:aws:s3:::$script:BUCKET_NAME/*"
            ]
        }
    ]
}
"@
        $s3Policy | Out-File -FilePath "s3-policy.json" -Encoding UTF8
        
        aws iam put-role-policy --role-name ImageGalleryS3Role --policy-name ImageGalleryS3Policy --policy-document file://s3-policy.json
        
        # Create instance profile
        aws iam create-instance-profile --instance-profile-name ImageGalleryInstanceProfile
        aws iam add-role-to-instance-profile --instance-profile-name ImageGalleryInstanceProfile --role-name ImageGalleryS3Role
        
        # Attach to instance (wait a moment for the profile to be ready)
        Start-Sleep -Seconds 10
        aws ec2 associate-iam-instance-profile --instance-id $script:INSTANCE_ID --iam-instance-profile Name=ImageGalleryInstanceProfile
        
        Write-Status "IAM role created and attached to EC2 instance"
        return $true
    }
    catch {
        Write-Error "Failed to create IAM role: $($_.Exception.Message)"
        return $false
    }
}

function New-EnvironmentFile {
    Write-Host "`n📝 Creating environment configuration..." -ForegroundColor Green
    
    $envContent = @"
# AWS Production Environment Variables
NODE_ENV=production
LOG_LEVEL=info

# Database Configuration
DB_CLIENT=postgres
POSTGRES_HOST=$script:DB_ENDPOINT
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=TempPassword123!
POSTGRES_DB=image_gallery

# Redis Configuration  
REDIS_URL=redis://$script:REDIS_ENDPOINT:6379

# S3 Configuration
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=placeholder
MINIO_SECRET_KEY=placeholder
MINIO_BUCKET=$script:BUCKET_NAME

# Application Configuration
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
WORKER_CONCURRENCY=3
SIGNED_URL_EXPIRY=3600

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://$script:PUBLIC_IP/api
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
FRONTEND_URL=http://$script:PUBLIC_IP

# AWS Region
AWS_REGION=us-east-1
"@
    
    $envContent | Out-File -FilePath ".env.deployment" -Encoding UTF8
    Write-Status "Environment file created: .env.deployment"
    
    Write-Warning "IMPORTANT: You need to update the S3 credentials in the environment file!"
    Write-Warning "Replace 'placeholder' values with your actual AWS Access Key and Secret Key"
}

function Show-DeploymentSummary {
    Write-Host "`n🎉 AWS Deployment Summary" -ForegroundColor Green
    Write-Host "========================" -ForegroundColor Green
    Write-Host "VPC ID: $script:VPC_ID" -ForegroundColor White
    Write-Host "EC2 Instance ID: $script:INSTANCE_ID" -ForegroundColor White
    Write-Host "Public IP: $script:PUBLIC_IP" -ForegroundColor White
    Write-Host "Database Endpoint: $script:DB_ENDPOINT" -ForegroundColor White
    Write-Host "Redis Endpoint: $script:REDIS_ENDPOINT" -ForegroundColor White
    Write-Host "S3 Bucket: $script:BUCKET_NAME" -ForegroundColor White
    Write-Host ""
    Write-Host "Next Steps:" -ForegroundColor Yellow
    Write-Host "1. Update the S3 credentials in .env.deployment file" -ForegroundColor White
    Write-Host "2. Copy .env.deployment to your EC2 instance as .env" -ForegroundColor White
    Write-Host "3. SSH to your instance: ssh -i image-gallery-key.pem ec2-user@$script:PUBLIC_IP" -ForegroundColor White
    Write-Host "4. Navigate to the project: cd /home/ec2-user/prompt-frame-gallery" -ForegroundColor White
    Write-Host "5. Start the application: sudo docker-compose up -d" -ForegroundColor White
    Write-Host ""
    Write-Host "Application URL: http://$script:PUBLIC_IP" -ForegroundColor Green
    Write-Host "Health Check: http://$script:PUBLIC_IP/api/health" -ForegroundColor Green
}

function Remove-AWSResources {
    Write-Host "`n🗑️  Removing AWS resources..." -ForegroundColor Red
    Write-Warning "This will delete all AWS resources created for the Image Gallery!"
    
    $confirmation = Read-Host "Are you sure? Type 'DELETE' to confirm"
    if ($confirmation -ne "DELETE") {
        Write-Host "Deletion cancelled." -ForegroundColor Yellow
        return
    }
    
    try {
        # Terminate EC2 instance
        if ($script:INSTANCE_ID) {
            Write-Status "Terminating EC2 instance..."
            aws ec2 terminate-instances --instance-ids $script:INSTANCE_ID
            aws ec2 wait instance-terminated --instance-ids $script:INSTANCE_ID
        }
        
        # Delete RDS instance
        Write-Status "Deleting RDS instance..."
        aws rds delete-db-instance --db-instance-identifier image-gallery-db --skip-final-snapshot --delete-automated-backups
        
        # Delete Redis cluster
        Write-Status "Deleting Redis cluster..."
        aws elasticache delete-cache-cluster --cache-cluster-id image-gallery-redis
        
        # Delete S3 bucket
        if ($script:BUCKET_NAME) {
            Write-Status "Emptying and deleting S3 bucket..."
            aws s3 rm "s3://$script:BUCKET_NAME" --recursive
            aws s3 rb "s3://$script:BUCKET_NAME"
        }
        
        Write-Status "AWS resources deletion initiated. Some resources may take time to fully delete."
    }
    catch {
        Write-Error "Error during cleanup: $($_.Exception.Message)"
    }
}

# Main execution
switch ($Action.ToLower()) {
    "deploy" {
        if (!(Test-AWSCLIInstalled) -or !(Test-AWSCredentials)) {
            exit 1
        }
        
        if (!$SkipInfrastructure) {
            if (!(New-AWSInfrastructure)) {
                exit 1
            }
            
            Wait-ForRDSAndRedis
        }
        
        if (!(New-EC2Instance)) {
            exit 1
        }
        
        if (!(New-IAMRoleForS3)) {
            exit 1
        }
        
        New-EnvironmentFile
        Show-DeploymentSummary
    }
    
    "cleanup" {
        Remove-AWSResources
    }
    
    default {
        Write-Host "Usage: .\deploy-aws.ps1 -Action [deploy|cleanup]" -ForegroundColor Yellow
        Write-Host "Options:" -ForegroundColor Yellow
        Write-Host "  -Action deploy    : Deploy the application to AWS"
        Write-Host "  -Action cleanup   : Remove all AWS resources"
        Write-Host "  -SkipInfrastructure : Skip infrastructure creation (for redeployment)"
    }
}
