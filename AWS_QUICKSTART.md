# 🚀 AWS Quick Start Guide - Image Gallery Deployment

**Complete deployment from scratch in ~30 minutes**

## 📋 What You Need

- AWS Account (create at aws.amazon.com)
- Windows machine with internet access
- Credit card for AWS (estimated cost: ~$72/month)

## ⚡ 5-Minute Setup

### Step 1: Create AWS Account
1. Go to https://aws.amazon.com → "Create an AWS Account"
2. Complete registration and verify phone number
3. Choose "Basic Support Plan" (free)

### Step 2: Install AWS CLI
```powershell
# Run in PowerShell as Administrator
Invoke-WebRequest -Uri "https://awscli.amazonaws.com/AWSCLIV2.msi" -OutFile "AWSCLIV2.msi"
Start-Process -FilePath "AWSCLIV2.msi" -ArgumentList "/quiet" -Wait

# Restart PowerShell, then verify
aws --version
```

### Step 3: Create IAM User
1. Go to AWS Console → IAM → Users → "Add user"
2. Username: `image-gallery-deploy`
3. Access type: ✅ **Programmatic access**
4. Permissions: Attach policy **"PowerUserAccess"**
5. **SAVE THE ACCESS KEYS** (you won't see them again!)

### Step 4: Configure AWS CLI
```powershell
aws configure
# Enter your Access Key ID
# Enter your Secret Access Key
# Region: us-east-1
# Output: json
```

## 🚀 One-Click Deployment

### Step 5: Run Automated Deployment
```powershell
# Navigate to your project directory
cd C:\Users\harsh\prompt-frame-gallery

# Run the automated deployment script
.\deploy-aws.ps1 -Action deploy
```

**What this script does:**
- ✅ Creates complete AWS infrastructure (VPC, subnets, security groups)
- ✅ Sets up RDS PostgreSQL database
- ✅ Creates ElastiCache Redis cluster
- ✅ Creates S3 bucket with proper permissions
- ✅ Launches EC2 instance with Docker pre-installed
- ✅ Configures IAM roles for S3 access
- ✅ Generates environment configuration
- ✅ Waits for all services to be ready (~15 minutes)

## 📝 Complete the Deployment

### Step 6: Update S3 Credentials
The script creates `.env.deployment` file. Edit it and replace:
```bash
MINIO_ACCESS_KEY=your_aws_access_key_id
MINIO_SECRET_KEY=your_aws_secret_access_key
```

### Step 7: Deploy Application
The script will show you these commands:
```powershell
# SSH to your EC2 instance
ssh -i image-gallery-key.pem ec2-user@YOUR_PUBLIC_IP

# Once connected to EC2:
cd /home/ec2-user/prompt-frame-gallery
# Upload your .env file here, then:
sudo docker-compose up -d

# Check status
sudo docker-compose ps
```

## 🎉 You're Live!

Your application will be available at:
- **Application**: `http://YOUR_PUBLIC_IP`
- **Health Check**: `http://YOUR_PUBLIC_IP/api/health`

## 🔧 Architecture Created

Your deployment includes:
- **EC2 t3.medium**: Application server
- **RDS PostgreSQL**: Managed database
- **ElastiCache Redis**: Queue processing
- **S3 Bucket**: Image storage
- **VPC**: Private network with security groups

## 💰 Cost Breakdown (~$72/month)
- EC2 t3.medium: ~$30
- RDS db.t3.micro: ~$15  
- ElastiCache: ~$15
- S3 Storage: ~$2
- Data Transfer: ~$10

## 🔄 Management Commands

```powershell
# To cleanup everything (DELETE ALL RESOURCES)
.\deploy-aws.ps1 -Action cleanup

# To redeploy application only (infrastructure stays)
.\deploy-aws.ps1 -Action deploy -SkipInfrastructure
```

## 🚨 Troubleshooting

**Script fails?**
- Check AWS credentials: `aws sts get-caller-identity`
- Ensure PowerShell is run as Administrator
- Verify internet connection

**Can't connect to application?**
- Check security groups allow HTTP (port 80)
- Verify EC2 instance is running
- Check Docker containers: `sudo docker-compose ps`

**Database issues?**
- RDS takes 10-15 minutes to be ready
- Check security groups allow PostgreSQL (port 5432)

## 🔒 Security Notes

**IMPORTANT: After deployment**
1. Change RDS password from default `TempPassword123!`
2. Restrict SSH access to your IP only
3. Enable MFA on your AWS account
4. Set up SSL certificates for production

## 📞 Support

If you get stuck:
1. Check the detailed `AWS_DEPLOYMENT.md` guide
2. Review AWS console for resource status
3. Check logs: `sudo docker-compose logs -f`

## 🎯 Next Steps (Optional)

1. **Domain Setup**: Point your domain to the EC2 IP
2. **SSL Certificate**: Use Let's Encrypt or AWS Certificate Manager  
3. **Monitoring**: Set up CloudWatch alerts
4. **Backups**: Configure automated RDS and S3 backups
5. **Scaling**: Move to ECS/EKS for production scaling

---

**That's it! Your production-ready Image Gallery is now running on AWS!** 🎉
