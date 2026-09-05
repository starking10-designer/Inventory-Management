from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database.database import get_db
from app.models.system_auth import SystemConfig, AdminUser, BrandProfile, ActivationOTP
from app.services.auth_service import get_password_hash
from pydantic import BaseModel
import string
import random
from datetime import datetime, timedelta

router = APIRouter(prefix="/api/system", tags=["System"])

@router.get("/status")
def get_system_status(db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    if not config:
        return {"is_registered": False}
    return {"is_registered": config.is_registered}

class RequestKeyData(BaseModel):
    display_name: str
    username: str
    email: str
    mobile_number: str = None
    brand_name: str = None
    gst_number: str = None
    address: str = None

from app.services.email_service import send_activation_email

@router.post("/request-key")
def request_key(data: RequestKeyData, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    if config and config.is_registered:
        raise HTTPException(status_code=400, detail="System already registered")

    # Generate 12 digit key
    key = ''.join(random.choices(string.digits, k=12))
    
    otp = ActivationOTP(
        otp_key=key,
        expires_at=datetime.utcnow() + timedelta(minutes=10)
    )
    db.add(otp)
    db.commit()
    
    # Format for the email: 1234-5678-9012
    formatted_key = f"{key[:4]}-{key[4:8]}-{key[8:]}"
    
    # Send email to developer (does not print to terminal)
    send_activation_email(formatted_key, data.dict())
    
    return {"message": "Activation request sent! The developer will contact you shortly with the key."}

class RegisterData(BaseModel):
    product_key: str
    display_name: str
    username: str
    email: str
    password: str
    mobile_number: str = None
    brand_name: str = None
    gst_number: str = None
    address: str = None
    app_icon: str = None

@router.post("/register")
def register_system(data: RegisterData, db: Session = Depends(get_db)):
    config = db.query(SystemConfig).first()
    if config and config.is_registered:
        raise HTTPException(status_code=400, detail="System already registered")
        
    # Verify product key
    otp = db.query(ActivationOTP).filter(ActivationOTP.otp_key == data.product_key).first()
    if not otp:
        raise HTTPException(status_code=400, detail="Invalid activation key")
    if otp.expires_at < datetime.utcnow():
        raise HTTPException(status_code=400, detail="Activation key expired")
    
    # Create the admin user
    hashed_password = get_password_hash(data.password)
    admin = AdminUser(
        display_name=data.display_name,
        username=data.username,
        email=data.email,
        password_hash=hashed_password,
        mobile_number=data.mobile_number
    )
    db.add(admin)
    
    # Create brand profile
    brand = BrandProfile(
        brand_name=data.brand_name,
        gst_number=data.gst_number,
        address=data.address,
        app_icon=data.app_icon
    )
    db.add(brand)
    
    # Mark system as registered
    if not config:
        config = SystemConfig(is_registered=True, registration_date=datetime.utcnow())
        db.add(config)
    else:
        config.is_registered = True
        config.registration_date = datetime.utcnow()
        
    # Delete the used OTP to keep database clean
    db.delete(otp)
    db.commit()
    
    # Auto-login the user
    from app.services.auth_service import create_access_token, ACCESS_TOKEN_EXPIRE_MINUTES
    access_token_expires = timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    access_token = create_access_token(
        data={"sub": admin.username}, expires_delta=access_token_expires
    )
    
    return {
        "message": "System registered successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "username": admin.username,
            "displayName": admin.display_name,
            "email": admin.email,
            "mobileNumber": admin.mobile_number,
        },
        "brand": {
            "brandName": brand.brand_name if brand else "",
            "gstNumber": brand.gst_number if brand else "",
            "brandAddress": brand.address if brand else "",
            "appIcon": brand.app_icon if brand else ""
        }
    }

from fastapi import File, UploadFile, Form

@router.post("/send-email")
async def send_custom_email(
    from_email: str = Form(...),
    app_password: str = Form(...),
    to_email: str = Form(...),
    cc_email: str = Form(""),
    subject: str = Form(...),
    file: UploadFile = File(...)
):
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart
    from email.mime.application import MIMEApplication
    
    msg = MIMEMultipart()
    msg['From'] = from_email
    msg['To'] = to_email
    msg['Subject'] = subject
    if cc_email:
        msg['Cc'] = cc_email
        
    body = "Please find the requested sales performance report attached."
    msg.attach(MIMEText(body, 'plain'))
    
    content = await file.read()
    part = MIMEApplication(content, Name=file.filename)
    part['Content-Disposition'] = f'attachment; filename="{file.filename}"'
    msg.attach(part)
    
    try:
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(from_email, app_password)
        receivers = [to_email]
        if cc_email:
            receivers.extend([c.strip() for c in cc_email.split(',') if c.strip()])
        server.send_message(msg, from_addr=from_email, to_addrs=receivers)
        server.quit()
        return {"message": "Email sent successfully!"}
    except Exception as e:
        print(f"Failed to send email: {e}")
        raise HTTPException(status_code=500, detail=str(e))
