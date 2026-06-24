import os
import json
import sys
import urllib.request

try:
    sys.stdout.reconfigure(encoding='utf-8')
except AttributeError:
    pass

# Load env variables from dashboard/.env.local
root_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_path = os.path.join(root_dir, "dashboard", ".env.local")

def load_env_local(env_path):
    env_vars = {}
    if os.path.exists(env_path):
        with open(env_path, "r", encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#"):
                    parts = line.split("=", 1)
                    if len(parts) == 2:
                        env_vars[parts[0].strip()] = parts[1].strip().strip('"').strip("'")
    return env_vars

env_vars = load_env_local(env_path)
supabase_url = env_vars.get("NEXT_PUBLIC_SUPABASE_URL")
supabase_anon_key = env_vars.get("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not supabase_url or not supabase_anon_key:
    print("Error: Supabase config not found")
    sys.exit(1)

req_url = f"{supabase_url}/rest/v1/candidates?select=name,status,v2_result,onboard_date,created_at,v1_date,department,role"
req = urllib.request.Request(
    req_url,
    headers={
        "apikey": supabase_anon_key,
        "Authorization": f"Bearer {supabase_anon_key}"
    }
)

with urllib.request.urlopen(req) as response:
    candidates = json.loads(response.read().decode("utf-8"))

print("--- HIRED / OFFER / ONBOARDED CANDIDATES ---")
count = 0
for c in candidates:
    status = str(c.get("status") or "").lower()
    v2 = str(c.get("v2_result") or "").lower()
    onboard = c.get("onboard_date")
    
    is_hired = status in ["hired", "offer"] or v2 in ["đạt", "pass"] or onboard is not None
    if is_hired:
        count += 1
        print(f"Name: {c.get('name')} | Status: {status} | V2 Result: {v2} | Onboard Date: {onboard} | Created At: {c.get('created_at')} | V1 Date: {c.get('v1_date')} | Dept: {c.get('department')} | Role: {c.get('role')}")

print(f"\nTotal hired/offer candidates in DB: {count}")
