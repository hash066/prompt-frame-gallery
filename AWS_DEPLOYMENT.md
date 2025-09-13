# Image Gallery - Complete AWS Deployment Guide

This guide will walk you through deploying the Image Gallery application on AWS from absolute scratch, assuming you have no AWS services set up.

## 🏗️ AWS Architecture Overview

We'll deploy using this architecture:
- **EC2 Instance**: Application server running Docker containers
- **RDS PostgreSQL**: Managed database service
- **ElastiCache Redis**: Managed Redis for job queues
- **S3 Bucket**: Object storage for images
- **Application Load Balancer**: Load balancing and SSL termination
- **Route 53**: DNS management
- **CloudFront**: CDN for image delivery
- **CloudWatch**: Monitoring and logging

## 📋 Prerequisites

- AWS Account (create at aws.amazon.com)
- Domain name (can be purchased through Route 53)
- Credit card for AWS billing
- Windows machine with internet access

## 🚀 Step 1: AWS Account Setup

### 1.1 Create AWS Account
1. Go to https://aws.amazon.com
2. Click "Create an AWS Account"
3. Follow the registration process
4. Verify your identity with a phone number
5. Choose "Basic Support Plan" (free)

### 1.2 Set Up Billing Alerts
1. Go to AWS Console → Billing Dashboard
2. Set up a billing alert for $50/month to avoid surprises

### 1.3 Install AWS CLI on Windows
```powershell
# Download AWS CLI installer
Invoke-WebRequest -Uri "https://awscli.amazonaws.com/AWSCLIV2.msi" -OutFile "AWSCLIV2.msi"

# Install AWS CLI
Start-Process -FilePath "AWSCLIV2.msi" -ArgumentList "/quiet" -Wait

# Verify installation (restart PowerShell first)
aws --version
```

### 1.4 Create IAM User for Deployment
1. Go to AWS Console → IAM → Users
2. Click "Add user"
3. Username: `image-gallery-deploy`
4. Access type: ✅ Programmatic access
5. Permissions: Attach existing policy "PowerUserAccess"
6. **Save the Access Key ID and Secret Access Key** (you won't see them again!)

### 1.5 Configure AWS CLI
```powershell
aws configure
# AWS Access Key ID: [your access key]
# AWS Secret Access Key: [your secret key]
# Default region name: us-east-1
# Default output format: json
```

## 🚀 Step 2: Create AWS Resources

### 2.1 Create VPC and Networking
```powershell
# Create VPC
aws ec2 create-vpc --cidr-block 10.0.0.0/16 --tag-specifications 'ResourceType=vpc,Tags=[{Key=Name,Value=image-gallery-vpc}]'

# Note the VPC ID from output, then export it
$VPC_ID = "vpc-xxxxxxxxx"  # Replace with your VPC ID

# Create Internet Gateway
aws ec2 create-internet-gateway --tag-specifications 'ResourceType=internet-gateway,Tags=[{Key=Name,Value=image-gallery-igw}]'
$IGW_ID = "igw-xxxxxxxxx"  # Replace with your IGW ID

# Attach Internet Gateway to VPC
aws ec2 attach-internet-gateway --vpc-id $VPC_ID --internet-gateway-id $IGW_ID

# Create public subnet
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.1.0/24 --availability-zone us-east-1a --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=image-gallery-subnet-1}]'
$SUBNET_1 = "subnet-xxxxxxxxx"  # Replace with your subnet ID

# Create second public subnet (required for RDS and Load Balancer)
aws ec2 create-subnet --vpc-id $VPC_ID --cidr-block 10.0.2.0/24 --availability-zone us-east-1b --tag-specifications 'ResourceType=subnet,Tags=[{Key=Name,Value=image-gallery-subnet-2}]'
$SUBNET_2 = "subnet-xxxxxxxxx"  # Replace with your subnet ID

# Create route table
aws ec2 create-route-table --vpc-id $VPC_ID --tag-specifications 'ResourceType=route-table,Tags=[{Key=Name,Value=image-gallery-rt}]'
$RT_ID = "rtb-xxxxxxxxx"  # Replace with your route table ID

# Add route to internet gateway
aws ec2 create-route --route-table-id $RT_ID --destination-cidr-block 0.0.0.0/0 --gateway-id $IGW_ID

# Associate route table with subnets
aws ec2 associate-route-table --subnet-id $SUBNET_1 --route-table-id $RT_ID
aws ec2 associate-route-table --subnet-id $SUBNET_2 --route-table-id $RT_ID

# Enable auto-assign public IP
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_1 --map-public-ip-on-launch
aws ec2 modify-subnet-attribute --subnet-id $SUBNET_2 --map-public-ip-on-launch
```

### 2.2 Create Security Groups
```powershell
# Security group for EC2 instance
aws ec2 create-security-group --group-name image-gallery-ec2-sg --description "Security group for Image Gallery EC2" --vpc-id $VPC_ID
$EC2_SG = "sg-xxxxxxxxx"  # Replace with your security group ID

# Allow HTTP, HTTPS, and SSH
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 80 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 443 --cidr 0.0.0.0/0
aws ec2 authorize-security-group-ingress --group-id $EC2_SG --protocol tcp --port 22 --cidr 0.0.0.0/0

# Security group for RDS
aws ec2 create-security-group --group-name image-gallery-rds-sg --description "Security group for Image Gallery RDS" --vpc-id $VPC_ID
$RDS_SG = "sg-xxxxxxxxx"  # Replace with your RDS security group ID

# Allow PostgreSQL access from EC2 security group
aws ec2 authorize-security-group-ingress --group-id $RDS_SG --protocol tcp --port 5432 --source-group $EC2_SG

# Security group for ElastiCache
aws ec2 create-security-group --group-name image-gallery-redis-sg --description "Security group for Image Gallery Redis" --vpc-id $VPC_ID
$REDIS_SG = "sg-xxxxxxxxx"  # Replace with your Redis security group ID

# Allow Redis access from EC2 security group
aws ec2 authorize-security-group-ingress --group-id $REDIS_SG --protocol tcp --port 6379 --source-group $EC2_SG
```

### 2.3 Create S3 Bucket
```powershell
# Create unique bucket name (S3 bucket names must be globally unique)
$BUCKET_NAME = "image-gallery-$(Get-Random -Minimum 1000 -Maximum 9999)-$(Get-Date -Format 'yyyyMMdd')"

# Create S3 bucket
aws s3 mb s3://$BUCKET_NAME --region us-east-1

# Set bucket policy for public read access to processed images
@"
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Sid": "PublicReadGetObject",
            "Effect": "Allow",
            "Principal": "*",
            "Action": "s3:GetObject",
            "Resource": "arn:aws:s3:::$BUCKET_NAME/images/*/responsive/*",
            "Condition": {
                "StringEquals": {
                    "s3:ExistingObjectTag/public": "true"
                }
            }
        }
    ]
}
"@ | Out-File -FilePath bucket-policy.json -Encoding UTF8

aws s3api put-bucket-policy --bucket $BUCKET_NAME --policy file://bucket-policy.json

# Enable versioning
aws s3api put-bucket-versioning --bucket $BUCKET_NAME --versioning-configuration Status=Enabled

# Configure CORS for web access
@"
{
    "CORSRules": [
        {
            "AllowedHeaders": ["*"],
            "AllowedMethods": ["GET", "HEAD"],
            "AllowedOrigins": ["*"],
            "ExposeHeaders": [],
            "MaxAgeSeconds": 3000
        }
    ]
}
"@ | Out-File -FilePath cors-config.json -Encoding UTF8

aws s3api put-bucket-cors --bucket $BUCKET_NAME --cors-configuration file://cors-config.json
```

### 2.4 Create RDS PostgreSQL Database
```powershell
# Create DB subnet group
aws rds create-db-subnet-group --db-subnet-group-name image-gallery-subnet-group --db-subnet-group-description "Subnet group for Image Gallery" --subnet-ids $SUBNET_1 $SUBNET_2

# Create RDS instance (this takes 10-15 minutes)
aws rds create-db-instance `
  --db-instance-identifier image-gallery-db `
  --db-instance-class db.t3.micro `
  --engine postgres `
  --master-username postgres `
  --master-user-password 'ChangeMe123!' `
  --allocated-storage 20 `
  --storage-type gp2 `
  --db-name image_gallery `
  --vpc-security-group-ids $RDS_SG `
  --db-subnet-group-name image-gallery-subnet-group `
  --backup-retention-period 7 `
  --storage-encrypted `
  --auto-minor-version-upgrade `
  --deletion-protection

# Wait for DB to be available (check status)
aws rds describe-db-instances --db-instance-identifier image-gallery-db --query 'DBInstances[0].DBInstanceStatus'
```

### 2.5 Create ElastiCache Redis Cluster
```powershell
# Create cache subnet group
aws elasticache create-cache-subnet-group --cache-subnet-group-name image-gallery-cache-subnet --cache-subnet-group-description "Cache subnet group for Image Gallery" --subnet-ids $SUBNET_1 $SUBNET_2

# Create Redis cluster
aws elasticache create-cache-cluster `
  --cache-cluster-id image-gallery-redis `
  --cache-node-type cache.t3.micro `
  --engine redis `
  --num-cache-nodes 1 `
  --security-group-ids $REDIS_SG `
  --cache-subnet-group-name image-gallery-cache-subnet

# Wait for Redis to be available
aws elasticache describe-cache-clusters --cache-cluster-id image-gallery-redis --query 'CacheClusters[0].CacheClusterStatus'
```

## 🚀 Step 3: Launch EC2 Instance

### 3.1 Create Key Pair
```powershell
# Create key pair for EC2 access
aws ec2 create-key-pair --key-name image-gallery-key --query 'KeyMaterial' --output text | Out-File -FilePath image-gallery-key.pem -Encoding ASCII

# Set appropriate permissions (Windows)
icacls image-gallery-key.pem /inheritance:r
icacls image-gallery-key.pem /grant:r "$env:USERNAME:(R)"
```

### 3.2 Launch EC2 Instance
```powershell
# Get latest Amazon Linux 2 AMI ID
$AMI_ID = aws ec2 describe-images --owners amazon --filters "Name=name,Values=amzn2-ami-hvm-*-x86_64-gp2" --query 'Images | sort_by(@, &CreationDate) | [-1].ImageId' --output text

# Launch EC2 instance
aws ec2 run-instances `
  --image-id $AMI_ID `
  --count 1 `
  --instance-type t3.medium `
  --key-name image-gallery-key `
  --security-group-ids $EC2_SG `
  --subnet-id $SUBNET_1 `
  --tag-specifications 'ResourceType=instance,Tags=[{Key=Name,Value=image-gallery-server}]' `
  --user-data file://user-data.sh

# Get instance ID
$INSTANCE_ID = aws ec2 describe-instances --filters "Name=tag:Name,Values=image-gallery-server" --query 'Reservations[0].Instances[0].InstanceId' --output text

# Wait for instance to be running
aws ec2 wait instance-running --instance-ids $INSTANCE_ID

# Get public IP
$PUBLIC_IP = aws ec2 describe-instances --instance-ids $INSTANCE_ID --query 'Reservations[0].Instances[0].PublicIpAddress' --output text
Write-Output "Instance Public IP: $PUBLIC_IP"
```

### 3.3 Create User Data Script
```powershell
# Create user data script for EC2 initialization
@"
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
"@ | Out-File -FilePath user-data.sh -Encoding UTF8
```

## 🚀 Step 4: Get Service Endpoints

### 4.1 Get Database Endpoint
```powershell
# Get RDS endpoint
$DB_ENDPOINT = aws rds describe-db-instances --db-instance-identifier image-gallery-db --query 'DBInstances[0].Endpoint.Address' --output text
Write-Output "Database Endpoint: $DB_ENDPOINT"
```

### 4.2 Get Redis Endpoint
```powershell
# Get Redis endpoint
$REDIS_ENDPOINT = aws elasticache describe-cache-clusters --cache-cluster-id image-gallery-redis --show-cache-node-info --query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' --output text
Write-Output "Redis Endpoint: $REDIS_ENDPOINT"
```

## 🚀 Step 5: Configure Application

### 5.1 Create AWS Environment File
```powershell
# Create AWS-specific environment configuration
@"
# AWS Production Environment Variables
NODE_ENV=production
LOG_LEVEL=info

# Database Configuration
DB_CLIENT=postgres
POSTGRES_HOST=$DB_ENDPOINT
POSTGRES_PORT=5432
POSTGRES_USER=postgres
POSTGRES_PASSWORD=ChangeMe123!
POSTGRES_DB=image_gallery

# Redis Configuration  
REDIS_URL=redis://$REDIS_ENDPOINT:6379

# S3 Configuration (using S3 instead of MinIO)
MINIO_ENDPOINT=s3.amazonaws.com
MINIO_PORT=443
MINIO_USE_SSL=true
MINIO_ACCESS_KEY=your_aws_access_key
MINIO_SECRET_KEY=your_aws_secret_key
MINIO_BUCKET=$BUCKET_NAME

# Application Configuration
MAX_FILE_SIZE=10485760
MAX_FILES_PER_REQUEST=10
WORKER_CONCURRENCY=3
SIGNED_URL_EXPIRY=3600

# Frontend Configuration
NEXT_PUBLIC_API_URL=http://$PUBLIC_IP/api
NEXT_PUBLIC_MAX_FILE_SIZE=10485760
NEXT_PUBLIC_ALLOWED_TYPES=image/jpeg,image/png,image/webp,image/avif
FRONTEND_URL=http://$PUBLIC_IP
"@ | Out-File -FilePath .env.aws -Encoding UTF8

Write-Output "Created .env.aws file with AWS configuration"
```

### 5.2 Create IAM Role for S3 Access
```powershell
# Create IAM role for EC2 to access S3
@"
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
"@ | Out-File -FilePath trust-policy.json -Encoding UTF8

aws iam create-role --role-name ImageGalleryS3Role --assume-role-policy-document file://trust-policy.json

# Create S3 access policy
@"
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
                "arn:aws:s3:::$BUCKET_NAME",
                "arn:aws:s3:::$BUCKET_NAME/*"
            ]
        }
    ]
}
"@ | Out-File -FilePath s3-policy.json -Encoding UTF8

aws iam put-role-policy --role-name ImageGalleryS3Role --policy-name ImageGalleryS3Policy --policy-document file://s3-policy.json

# Create instance profile
aws iam create-instance-profile --instance-profile-name ImageGalleryInstanceProfile
aws iam add-role-to-instance-profile --instance-profile-name ImageGalleryInstanceProfile --role-name ImageGalleryS3Role

# Attach instance profile to EC2
aws ec2 associate-iam-instance-profile --instance-id $INSTANCE_ID --iam-instance-profile Name=ImageGalleryInstanceProfile
```

## 🚀 Step 6: Deploy Application

### 6.1 Connect to EC2 and Deploy
```powershell
# SSH to EC2 instance (you'll need an SSH client like PuTTY or use WSL)
Write-Output "Connect to your EC2 instance:"
Write-Output "ssh -i image-gallery-key.pem ec2-user@$PUBLIC_IP"
Write-Output ""
Write-Output "Then run these commands on the EC2 instance:"
Write-Output ""
Write-Output @"
# Navigate to project directory
cd /home/ec2-user/prompt-frame-gallery

# Copy environment configuration
# (Upload your .env.aws file to the EC2 instance as .env)

# Start the application
sudo docker-compose -f docker-compose.yml up -d

# Check status
sudo docker-compose ps

# View logs
sudo docker-compose logs -f
"@
```

### 6.2 Create Deployment Script
```powershell
# Create deployment script for easy management
@"
#!/bin/bash
# AWS Deployment Script for Image Gallery

cd /home/ec2-user/prompt-frame-gallery

# Pull latest code
git pull origin main

# Rebuild and restart containers
sudo docker-compose -f docker-compose.yml down
sudo docker-compose -f docker-compose.yml build --no-cache
sudo docker-compose -f docker-compose.yml up -d

# Show status
sudo docker-compose ps

echo "Deployment complete!"
echo "Application URL: http://$PUBLIC_IP"
echo "Health Check: http://$PUBLIC_IP/api/health"
"@ | Out-File -FilePath deploy-aws.sh -Encoding UTF8

Write-Output "Created deployment script: deploy-aws.sh"
```

## 🚀 Step 7: Set Up Domain and SSL (Optional)

### 7.1 Configure Route 53
```powershell
# Create hosted zone (if you don't have one)
$DOMAIN = "yourdomain.com"  # Replace with your domain
aws route53 create-hosted-zone --name $DOMAIN --caller-reference $(Get-Date -Format "yyyyMMddHHmmss")

# Create A record pointing to EC2 instance
$HOSTED_ZONE_ID = aws route53 list-hosted-zones --query "HostedZones[?Name=='$DOMAIN.'].Id" --output text

@"
{
    "Comment": "Add A record for image gallery",
    "Changes": [
        {
            "Action": "CREATE",
            "ResourceRecordSet": {
                "Name": "$DOMAIN",
                "Type": "A",
                "TTL": 300,
                "ResourceRecords": [
                    {
                        "Value": "$PUBLIC_IP"
                    }
                ]
            }
        }
    ]
}
"@ | Out-File -FilePath route53-changeset.json -Encoding UTF8

aws route53 change-resource-record-sets --hosted-zone-id $HOSTED_ZONE_ID --change-batch file://route53-changeset.json
```

## 📊 Step 8: Monitoring Setup

### 8.1 CloudWatch Configuration
```powershell
# Create CloudWatch log group
aws logs create-log-group --log-group-name /aws/ec2/image-gallery

# Create CloudWatch alarms
aws cloudwatch put-metric-alarm `
  --alarm-name "ImageGallery-HighCPU" `
  --alarm-description "Alarm when CPU exceeds 80%" `
  --metric-name CPUUtilization `
  --namespace AWS/EC2 `
  --statistic Average `
  --period 300 `
  --threshold 80 `
  --comparison-operator GreaterThanThreshold `
  --dimensions Name=InstanceId,Value=$INSTANCE_ID `
  --evaluation-periods 2
```

## 💰 Cost Estimation

**Monthly AWS costs (approximate):**
- EC2 t3.medium: ~$30
- RDS db.t3.micro: ~$15
- ElastiCache cache.t3.micro: ~$15
- S3 storage (100GB): ~$2
- Data transfer: ~$10
- **Total: ~$72/month**

## 🔧 Next Steps After Deployment

1. **Test the application**: Visit `http://your-ec2-public-ip`
2. **Set up SSL**: Use Let's Encrypt or AWS Certificate Manager
3. **Configure backups**: Set up automated RDS and S3 backups
4. **Monitor**: Set up CloudWatch alerts
5. **Scale**: Consider using ECS or EKS for production scaling

## 🚨 Important Security Notes

- **Change default passwords** in your .env file
- **Restrict SSH access** to your IP only
- **Enable MFA** on your AWS account
- **Use least privilege** IAM policies
- **Enable CloudTrail** for auditing

## 📞 Troubleshooting

If you encounter issues:
1. Check EC2 instance logs: `sudo docker-compose logs -f`
2. Verify security groups allow required ports
3. Check RDS and Redis connectivity
4. Verify S3 bucket permissions
5. Review CloudWatch logs for errors

This completes your AWS deployment! The application should be accessible at your EC2 instance's public IP address.
