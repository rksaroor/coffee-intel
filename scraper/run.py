import psycopg2
import datetime

DB_URL = "postgresql://postgres.bsncioctcgrhkmhovymk:DHvIygO46aXzkf3u@aws-1-ap-southeast-1.pooler.supabase.com:5432/postgres"

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

cur.execute(
    "INSERT INTO coffee_prices (coffee_type, price, district, source, date) VALUES (%s,%s,%s,%s,%s)",
    ("Arabica", 850, "Chikmagalur", "manual", datetime.datetime.now())
)

conn.commit()
print("Inserted test data")

cur.close()
conn.close()
