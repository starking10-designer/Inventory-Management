import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

# ==========================================
# DEVELOPER CREDENTIALS
# Add your Gmail and App Password here directly
# ==========================================
DEVELOPER_EMAIL = "kstar6442@gmail.com"  
APP_PASSWORD = "wxvn doui uwwb pfas"       

def send_activation_email(activation_key: str, user_details: dict):
    if DEVELOPER_EMAIL == "your_email@gmail.com" or APP_PASSWORD == "your_app_password":
        print("WARNING: Email credentials not set in email_service.py. Email not sent.")
        return False

    subject = f"New System Activation Request - {user_details.get('brand_name', 'Unknown Brand')}"
    
    body = f"""
A new user has requested an activation key for the Inventory Management System.

=========================================
ACTIVATION KEY: {activation_key}
=========================================

User Profile Details:
---------------------
Display Name: {user_details.get('display_name')}
Username: {user_details.get('username')}
Email: {user_details.get('email')}
Mobile Number: {user_details.get('mobile_number')}

Brand Details:
--------------
Brand Name: {user_details.get('brand_name')}
GST Number: {user_details.get('gst_number', 'N/A')}
Address: {user_details.get('address', 'N/A')}

Please contact the user to verify these details and provide them with the activation key.
"""
    
    msg = MIMEMultipart()
    msg['From'] = DEVELOPER_EMAIL
    msg['To'] = DEVELOPER_EMAIL  # Self-mail
    msg['Subject'] = subject
    
    msg.attach(MIMEText(body, 'plain'))
    
    try:
        # Use SMTP_SSL for port 465
        server = smtplib.SMTP_SSL('smtp.gmail.com', 465)
        server.login(DEVELOPER_EMAIL, APP_PASSWORD)
        server.send_message(msg)
        server.quit()
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False
