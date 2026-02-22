import os
import requests
import json
from dotenv import load_dotenv

# Load env vars
load_dotenv(".env.local")

AUTH_URL = os.getenv("NEXT_PUBLIC_AUTH_SERVICE_URL")
CONSUMER_URL = os.getenv("NEXT_PUBLIC_CONSUMER_SERVICE_URL")
API_KEY = os.getenv("PCC_API_KEY")
API_SECRET = os.getenv("PCC_API_SECRET")

# Example simpl_id (we need to swap this with a real one)
SIMPL_ID = "test-simpl-id"

def get_pcc_token():
    print(f"Authenticating with {AUTH_URL}...")
    # NOTE: The exact auth payload depends on PointClickCare's OAuth2 flow (typically Client Credentials)
    payload = {
        "grant_type": "client_credentials",
        "client_id": API_KEY,
        "client_secret": API_SECRET
    }
    headers = {
        "Content-Type": "application/x-www-form-urlencoded"
    }
    
    response = requests.post(f"{AUTH_URL}/api/v1/auth/token", data=payload, headers=headers)
    response.raise_for_status()
    return response.json().get("access_token")

def fetch_patient_summary(token, simpl_id):
    print(f"Fetching summary for patient {simpl_id}...")
    headers = {
        "Authorization": f"Bearer {token}",
        "Accept": "application/json"
    }
    response = requests.get(f"{CONSUMER_URL}/api/v1/pcc/{simpl_id}/summary", headers=headers)
    response.raise_for_status()
    return response.json()

def main():
    if not AUTH_URL or "api.example.com" in AUTH_URL:
        print("ERROR: Please provide the real AUTH and CONSUMER URLs in .env.local!")
        return

    try:
        # 1. Get Token
        token = get_pcc_token()
        print("Successfully authenticated!")
        
        # 2. Get Summary
        summary = fetch_patient_summary(token, SIMPL_ID)
        print("\n--- Patient Summary ---")
        print(json.dumps(summary, indent=2))
        
        # 3. We'll fetch individual resources once we see the summary output!

    except requests.exceptions.RequestException as e:
        print(f"API Error: {e}")
        if e.response is not None:
             print(e.response.text)

if __name__ == "__main__":
    main()
