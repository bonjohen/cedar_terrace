# Cedar Terrace - Security Configuration Checklist

Quick reference checklist for configuring security and credentials.

## 📋 Local Development Setup

### Docker Services (Current Defaults - OK for Local)

- [ ] **PostgreSQL**
  - Host: `localhost:5432`
  - Database: `parking_dev`
  - Username: `postgres`
  - Password: `postgres`
  - Location: `local/docker-compose.yml` lines 8-10

- [ ] **MinIO (S3)**
  - Console: `http://localhost:9001`
  - Username: `minio`
  - Password: `minio123`
  - Location: `local/docker-compose.yml` lines 22-23

- [ ] **MailHog**
  - Web UI: `http://localhost:8025`
  - SMTP: `localhost:1025`
  - No credentials needed

### Environment Files

- [ ] Create `backend/.env` with local configuration
- [ ] Create `frontend-admin/.env` with API URL
- [ ] Create `frontend-recipient/.env` with API URL
- [ ] Create `mobile/.env` with device-appropriate API URL
- [ ] Create `workers/.env` (optional for local dev)
- [ ] Verify all `.env` files are in `.gitignore`

### Verify Local Security

- [ ] Docker containers only exposed to `localhost`
- [ ] Backend API only accepts requests from `localhost:3001`
- [ ] MinIO bucket `parking-evidence` created
- [ ] MailHog capturing emails (check `http://localhost:8025`)

---

## 🔒 Production Deployment Checklist

### AWS Account Setup

- [ ] Create AWS account (if not exists)
- [ ] Enable MFA on root account
- [ ] Create IAM admin user (not root)
- [ ] Enable MFA on IAM admin user

### AWS Access Keys

- [ ] Generate AWS access keys
  - IAM → Users → Your User → Security Credentials
  - Create Access Key → CLI access
- [ ] Save `AWS_ACCESS_KEY_ID` securely
- [ ] Save `AWS_SECRET_ACCESS_KEY` securely (shown only once!)
- [ ] Add keys to `workers/.env` for production
- [ ] **NEVER** commit access keys to git

### Database Security

- [ ] Change default PostgreSQL password
- [ ] Generate strong password (20+ characters)
  - PowerShell: `[System.Web.Security.Membership]::GeneratePassword(32,10)`
  - Linux/Mac: `openssl rand -base64 32`
- [ ] Store password in AWS Secrets Manager
- [ ] Update `DATABASE_URL` in backend/.env
- [ ] Use `?sslmode=require` in production connection string
- [ ] Enable encryption at rest on RDS
- [ ] Enable automatic backups
- [ ] Configure backup retention (7-30 days)
- [ ] Test point-in-time recovery

### S3 Bucket Security

- [ ] Create production bucket: `parking-evidence-prod`
- [ ] Enable encryption at rest (AES-256)
- [ ] Enable versioning
- [ ] Block all public access
- [ ] Create bucket policy (allow only backend IAM role)
- [ ] Enable access logging
- [ ] Set lifecycle policy for old evidence (optional)
- [ ] Test pre-signed URL generation

### Authentication (Cognito)

- [ ] Create Cognito User Pool for admins
- [ ] Create Cognito User Pool for recipients
- [ ] Configure password policy:
  - Minimum length: 12 characters
  - Require uppercase, lowercase, numbers, symbols
- [ ] Enable MFA (optional but recommended)
- [ ] Configure custom domain for hosted UI
- [ ] Add app clients for frontend applications
- [ ] Update `AUTH_MODE=cognito` in backend/.env
- [ ] Test admin login flow
- [ ] Test recipient activation flow

### Email (SES)

- [ ] Verify domain in SES
  - AWS Console → SES → Verified identities → Verify domain
  - Add DNS records to your domain
- [ ] OR verify individual email address
- [ ] Request production access (if needed)
  - Default is sandbox mode (limited recipients)
- [ ] Configure `SES_SENDER_EMAIL` in workers/.env
- [ ] Test email sending to verified addresses
- [ ] Monitor SES bounce/complaint rates

### SQS Queues

- [ ] Create queue: `cedar-terrace-timeline`
  - Visibility timeout: 60 seconds
  - Receive message wait time: 20 seconds (long polling)
- [ ] Create queue: `cedar-terrace-email`
  - Visibility timeout: 60 seconds
- [ ] Create queue: `cedar-terrace-ingestion`
  - Visibility timeout: 60 seconds
- [ ] Create dead-letter queues (DLQ) for each
  - Max receive count: 3
- [ ] Configure queue URLs in workers/.env
- [ ] Set up CloudWatch alarms for queue depth

### IAM Policies

- [ ] Create IAM role for backend (Lambda/ECS)
- [ ] Attach S3 policy (PutObject, GetObject only)
- [ ] Attach SQS policy (SendMessage to queues)
- [ ] Attach Secrets Manager policy (GetSecretValue)
- [ ] Attach CloudWatch Logs policy (CreateLogStream, PutLogEvents)

- [ ] Create IAM role for workers (Lambda/ECS)
- [ ] Attach SQS policy (ReceiveMessage, DeleteMessage)
- [ ] Attach SES policy (SendEmail)
- [ ] Attach RDS policy (database access)
- [ ] Attach CloudWatch Logs policy

- [ ] Test IAM permissions (principle of least privilege)
- [ ] Remove any overly permissive policies

### Network Security (VPC)

- [ ] Create VPC with public and private subnets
- [ ] Deploy backend/workers in private subnets
- [ ] Deploy RDS in private subnet
- [ ] Create NAT Gateway for outbound traffic
- [ ] Configure security groups:
  - Backend: Allow inbound from API Gateway only
  - RDS: Allow inbound from backend security group only
  - Workers: Allow outbound to SQS, SES, S3
- [ ] Enable VPC flow logs
- [ ] Test connectivity from backend to RDS

### SSL/HTTPS

- [ ] Request SSL certificate from ACM
  - Add your domain
  - Validate via DNS or email
- [ ] Configure CloudFront distribution
  - Origin: S3 bucket for frontend
  - Alternate domain names (CNAME)
  - SSL certificate: Select ACM cert
- [ ] Update DNS records (point domain to CloudFront)
- [ ] Test HTTPS access to frontend
- [ ] Configure HSTS headers
- [ ] Redirect HTTP → HTTPS

### API Security

- [ ] Configure CORS to allow only your domains
- [ ] Add rate limiting middleware
- [ ] Add request size limits
- [ ] Enable API logging (CloudWatch)
- [ ] Configure API Gateway (if using)
  - Add custom domain
  - Add API key for mobile app
  - Enable throttling
  - Enable caching (optional)
- [ ] Test rate limits
- [ ] Monitor API error rates

### Secrets Management

- [ ] Store database credentials in Secrets Manager
- [ ] Store S3 access keys in Secrets Manager (if not using IAM)
- [ ] Store Cognito app secrets in Secrets Manager
- [ ] Update backend to fetch secrets on startup
- [ ] Rotate secrets every 90 days
- [ ] Document secret rotation procedure

### Monitoring & Logging

- [ ] Enable CloudWatch Logs for backend
- [ ] Enable CloudWatch Logs for workers
- [ ] Enable CloudWatch Logs for API Gateway
- [ ] Enable RDS Enhanced Monitoring
- [ ] Enable S3 access logging
- [ ] Enable CloudTrail (audit logs)

### CloudWatch Alarms

- [ ] High error rate (backend > 5%)
- [ ] Database CPU > 80%
- [ ] Database connections > 80%
- [ ] SQS queue depth > 100 messages
- [ ] Lambda timeout errors
- [ ] Failed login attempts > 10/minute
- [ ] S3 4xx errors (unauthorized access attempts)
- [ ] SES bounce rate > 5%

### Testing

- [ ] Test complete end-to-end workflow
- [ ] Test observation submission (mobile → backend → violation)
- [ ] Test notice issuance (backend → worker → SES)
- [ ] Test recipient activation (email → portal → profile)
- [ ] Test timeline progression (worker → state transitions)
- [ ] Test photo upload to production S3
- [ ] Test authentication (Cognito login)
- [ ] Test error handling (network failures, invalid data)
- [ ] Perform security scan (npm audit, OWASP ZAP)
- [ ] Load testing (Apache Bench, Artillery)

### Deployment

- [ ] Build all packages (`npm run build --workspaces`)
- [ ] Deploy backend (Lambda or ECS)
- [ ] Deploy workers (Lambda or ECS)
- [ ] Deploy admin frontend (S3 + CloudFront)
- [ ] Deploy recipient portal (S3 + CloudFront)
- [ ] Run database migrations on production DB
- [ ] Seed initial data (sites, positions)
- [ ] Verify all services running
- [ ] Test all workflows in production

### Post-Deployment

- [ ] Update DNS records if needed
- [ ] Configure domain SSL certificates
- [ ] Enable auto-scaling (ECS or Lambda concurrency)
- [ ] Set up cost alerts (AWS Budgets)
- [ ] Document deployment process
- [ ] Train admin users
- [ ] Provide user documentation
- [ ] Set up on-call rotation
- [ ] Document incident response plan

---

## 🚨 Security Incident Response

### If Credentials Are Compromised

- [ ] Immediately rotate compromised credentials
  - AWS access keys: Delete and regenerate
  - Database password: Change in RDS console
  - Cognito: Force password reset for users
- [ ] Review CloudTrail logs for unauthorized access
- [ ] Review S3 access logs for data exfiltration
- [ ] Check CloudWatch logs for suspicious activity
- [ ] Revoke active sessions (JWT tokens, Cognito sessions)
- [ ] Document incident timeline
- [ ] Notify stakeholders
- [ ] Update credentials for all team members
- [ ] Implement additional monitoring
- [ ] Review and update security policies

---

## 📝 Regular Maintenance

### Weekly

- [ ] Review CloudWatch logs for errors
- [ ] Check SQS dead-letter queues
- [ ] Monitor SES bounce/complaint rates
- [ ] Review database performance metrics

### Monthly

- [ ] Review AWS costs
- [ ] Check for npm security updates (`npm audit`)
- [ ] Review CloudWatch alarms
- [ ] Test backup restoration
- [ ] Review IAM access patterns

### Quarterly

- [ ] Rotate AWS access keys
- [ ] Rotate database passwords
- [ ] Review IAM policies (remove unused permissions)
- [ ] Security audit (penetration testing)
- [ ] Update SSL certificates (if needed)
- [ ] Review user access (remove ex-employees)
- [ ] Update documentation

---

## 🔗 Quick Reference

### Environment Files Required

```
backend/.env                  # Backend API configuration
frontend-admin/.env           # Admin UI API URL
frontend-recipient/.env       # Recipient portal API URL
mobile/.env                   # Mobile app API URL
workers/.env                  # Worker services configuration
```

### AWS Services Used

- **RDS/Aurora**: PostgreSQL database
- **S3**: Evidence photo storage
- **SQS**: Asynchronous message queues
- **SES**: Email sending
- **Cognito**: User authentication
- **CloudWatch**: Logging and monitoring
- **Secrets Manager**: Credential storage
- **CloudFront**: CDN for frontends
- **ACM**: SSL certificates
- **IAM**: Access control

### Critical Security Settings

- **Database**: Encryption at rest, SSL required, private subnet
- **S3**: Block public access, encryption, versioning
- **API**: Rate limiting, CORS restrictions, HTTPS only
- **Auth**: Cognito MFA, strong passwords, session timeout
- **Network**: VPC isolation, security groups, WAF

### Emergency Contacts

- AWS Support: https://console.aws.amazon.com/support/
- Security Team: [Your contact info]
- On-Call Engineer: [Your contact info]

---

## ✅ Sign-Off

### Local Development

- [ ] All local services running
- [ ] Can submit observations
- [ ] Can view violations
- [ ] Can issue notices
- [ ] Email testing works (MailHog)

**Date**: ____________  **Approved By**: ____________

### Production Deployment

- [ ] All security configurations verified
- [ ] Monitoring and alarms configured
- [ ] Backup and recovery tested
- [ ] Documentation complete
- [ ] Team trained

**Date**: ____________  **Approved By**: ____________

---

**Note**: Keep this checklist up to date as your security requirements evolve. Review and update after each deployment or security incident.
