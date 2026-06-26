"""
Seed script — Aparoksha Retail demo data
Story: A fashion/lifestyle retail brand using WhatsApp to run promotions,
       reminders, and automated conversation flows.
"""

import sys, os, uuid, datetime, random
sys.path.insert(0, '/home/gutal/APFS_Connect')

from dotenv import load_dotenv
load_dotenv('/home/gutal/APFS_Connect/.env')

from database import SessionLocal, engine
from database.models import (
    Base, User, Flow, Promotion, Remainder, Campaign, CampaignJob,
    CampaignUserConversationMetadata, CampaignMetrics,
    MessageType, ActivityType, IntervalUnit,
)

# ── helpers ────────────────────────────────────────────────────────────────────

def uid(): return str(uuid.uuid4())

def dt(year, month, day, hour=9, minute=0):
    return datetime.datetime(year, month, day, hour, minute)

def rand_phone():
    return f"91{random.randint(7000000000, 9999999999)}"

def rand_td(min_sec=30, max_sec=600):
    return datetime.timedelta(seconds=random.randint(min_sec, max_sec))

# ── wipe existing data ──────────────────────────────────────────────────────────

def wipe(db):
    for model in [
        CampaignUserConversationMetadata, CampaignMetrics,
        CampaignJob, Campaign, Promotion, Remainder, Flow, User,
    ]:
        db.query(model).delete()
    db.commit()
    print("Wiped existing data.")

# ── seed ───────────────────────────────────────────────────────────────────────

def seed():
    db = SessionLocal()
    try:
        wipe(db)

        # ── USERS ────────────────────────────────────────────────────────────
        admin_id   = uid()
        priya_id   = uid()
        arjun_id   = uid()
        neha_id    = uid()

        admin = User(id=admin_id, name="Rahul Sharma", email="rahul@aparoksharetail.in",
                     phone="919876543210", role="admin", created_by=admin_id,
                     created_at=dt(2025, 10, 1))
        priya = User(id=priya_id, name="Priya Mehta", email="priya@aparoksharetail.in",
                     phone="919845123456", role="marketing_manager", created_by=admin_id,
                     created_at=dt(2025, 10, 3))
        arjun = User(id=arjun_id, name="Arjun Singh", email="arjun@aparoksharetail.in",
                     phone="919823456789", role="campaign_executive", created_by=admin_id,
                     created_at=dt(2025, 10, 5))
        neha  = User(id=neha_id,  name="Neha Patel",  email="neha@aparoksharetail.in",
                     phone="919812345678", role="content_manager",   created_by=admin_id,
                     created_at=dt(2025, 10, 5))

        db.add_all([admin, priya, arjun, neha])
        db.flush()
        print("Users created.")

        # ── FLOWS ────────────────────────────────────────────────────────────
        flow_ids = {k: uid() for k in [
            "festive", "flash_sale", "loyalty", "emi_reminder", "insurance"
        ]}

        flows = [
            Flow(id=flow_ids["festive"],       name="Festive Collection Enquiry",
                 trigger="FESTIVE",    flow_file="loan_creation_flow.json",
                 is_active=True,  created_by=priya_id,  created_at=dt(2025, 11, 1)),
            Flow(id=flow_ids["flash_sale"],    name="Flash Sale Registration",
                 trigger="FLASHSALE",  flow_file="loan_status_check_flow.json",
                 is_active=True,  created_by=priya_id,  created_at=dt(2025, 11, 15)),
            Flow(id=flow_ids["loyalty"],       name="Loyalty Program Signup",
                 trigger="LOYALTY",   flow_file="insurance_renewal_flow.json",
                 is_active=True,  created_by=arjun_id,  created_at=dt(2025, 12, 1)),
            Flow(id=flow_ids["emi_reminder"],  name="EMI Payment Reminder",
                 trigger="EMIPAY",    flow_file="emi_reminder_flow.json",
                 is_active=True,  created_by=neha_id,   created_at=dt(2025, 12, 10)),
            Flow(id=flow_ids["insurance"],     name="Policy Renewal Nudge",
                 trigger="RENEW",     flow_file="feedback_flow.json",
                 is_active=False, created_by=arjun_id,  created_at=dt(2025, 12, 20),
                 modified_by=priya_id, modified_at=dt(2026, 2, 5)),
        ]
        db.add_all(flows)
        db.flush()
        print("Flows created.")

        # ── PROMOTIONS ───────────────────────────────────────────────────────
        promo_ids = {k: uid() for k in [
            "republic", "valentine", "holi", "summer", "womens_day", "spring"
        ]}

        promotions = [
            Promotion(
                id=promo_ids["republic"],
                name="Republic Day Sale 2026",
                description="Flat 26% off on all ethnic wear to celebrate Republic Day.",
                connected_flow=flow_ids["festive"],
                promotion_type="Seasonal",
                header_message="🇮🇳 Republic Day Mega Sale!",
                footer_message="Valid till 26th Jan 2026. T&C apply.",
                message_body_type=MessageType.TEXT,
                message_body="Hey {{name}}! Celebrate Republic Day with up to 26% OFF on all ethnic wear. Shop now and save big! Reply FESTIVE to explore our collection.",
                is_active=False,
                created_by=priya_id, created_at=dt(2026, 1, 20),
                modified_by=arjun_id, modified_at=dt(2026, 1, 26),
            ),
            Promotion(
                id=promo_ids["valentine"],
                name="Valentine's Day Special",
                description="Curated couple outfits and gifting sets for Valentine's week.",
                connected_flow=flow_ids["flash_sale"],
                promotion_type="Occasion",
                header_message="💝 Valentine's Week Exclusives",
                footer_message="Offer valid 10–14 Feb 2026.",
                message_body_type=MessageType.IMAGE,
                message_body="Surprise your loved one this Valentine's! Explore our exclusive couple collection — starting ₹999. Reply FLASHSALE for today's best deals.",
                is_active=False,
                created_by=priya_id, created_at=dt(2026, 2, 8),
                modified_by=priya_id, modified_at=dt(2026, 2, 14),
            ),
            Promotion(
                id=promo_ids["womens_day"],
                name="Women's Day Power Collection",
                description="30% off on women's power-dressing collection for Women's Day.",
                connected_flow=flow_ids["loyalty"],
                promotion_type="Occasion",
                header_message="👩 Celebrating Women's Day 2026",
                footer_message="8 March only. Limited stock.",
                message_body_type=MessageType.TEXT,
                message_body="This Women's Day, dress powerfully! Get 30% OFF on our new power-dressing range. Reply LOYALTY to unlock exclusive member pricing.",
                is_active=False,
                created_by=neha_id, created_at=dt(2026, 3, 5),
                modified_by=neha_id, modified_at=dt(2026, 3, 8),
            ),
            Promotion(
                id=promo_ids["holi"],
                name="Holi Colour Carnival Sale",
                description="Vibrant colours, vibrant discounts — up to 35% off on summer casuals.",
                connected_flow=flow_ids["festive"],
                promotion_type="Seasonal",
                header_message="🎨 Holi Sale is LIVE!",
                footer_message="Play safe, shop smart. Offer till 15 Mar.",
                message_body_type=MessageType.IMAGE,
                message_body="Get colourful this Holi! Up to 35% off on summer casuals and festive prints. Grab yours before they're gone — reply FESTIVE to browse.",
                is_active=False,
                created_by=arjun_id, created_at=dt(2026, 3, 10),
                modified_by=arjun_id, modified_at=dt(2026, 3, 15),
            ),
            Promotion(
                id=promo_ids["summer"],
                name="Summer Wardrobe 2026",
                description="Complete summer styling guide with buy-2-get-1 on all summer essentials.",
                connected_flow=flow_ids["flash_sale"],
                promotion_type="Seasonal",
                header_message="☀️ Summer is Here — Shop the Look!",
                footer_message="Buy 2 Get 1 Free. Apr–May 2026.",
                message_body_type=MessageType.TEXT,
                message_body="{{name}}, summer's officially here! Buy 2 and get 1 FREE on all summer essentials — breezy tees, linen sets, and more. Reply FLASHSALE to shop now!",
                is_active=True,
                created_by=priya_id, created_at=dt(2026, 4, 1),
            ),
            Promotion(
                id=promo_ids["spring"],
                name="New Spring Collection Drop",
                description="Fresh spring prints — first access for loyalty members.",
                connected_flow=flow_ids["loyalty"],
                promotion_type="New Arrival",
                header_message="🌸 Spring Collection — Just Dropped!",
                footer_message="Members get early access till May 10.",
                message_body_type=MessageType.IMAGE,
                message_body="Fresh spring prints are here, {{name}}! 🌸 As a loyalty member you get 48hr early access. Reply LOYALTY to unlock your exclusive preview.",
                is_active=True,
                created_by=neha_id, created_at=dt(2026, 4, 20),
            ),
        ]
        db.add_all(promotions)
        db.flush()
        print("Promotions created.")

        # ── REMAINDERS ───────────────────────────────────────────────────────
        rem_ids = {k: uid() for k in [
            "cart", "loyalty_points", "emi", "wishlist", "appointment"
        ]}

        remainders = [
            Remainder(
                id=rem_ids["cart"],
                name="Cart Abandonment — 24hr Nudge",
                description="Remind customers who left items in cart without purchasing.",
                connected_flow=flow_ids["flash_sale"],
                remainder_type="Behavioural",
                header_message="🛒 You left something behind!",
                footer_message="Cart items held for 48 hrs only.",
                message_body_type=MessageType.TEXT,
                message_body="Hey {{name}}, looks like you left some great items in your cart! Complete your order now and get an extra 5% off. Reply FLASHSALE to continue shopping.",
                is_active=True,
                created_by=arjun_id, created_at=dt(2025, 12, 5),
            ),
            Remainder(
                id=rem_ids["loyalty_points"],
                name="Loyalty Points Expiry Alert",
                description="Notify members whose loyalty points are about to expire this month.",
                connected_flow=flow_ids["loyalty"],
                remainder_type="Scheduled",
                header_message="⭐ Your reward points are expiring!",
                footer_message="Points expire end of month. Use them now.",
                message_body_type=MessageType.TEXT,
                message_body="{{name}}, you have {{points}} reward points expiring on {{expiry_date}}! Redeem them now for exciting discounts. Reply LOYALTY to check your balance.",
                is_active=True,
                created_by=priya_id, created_at=dt(2025, 12, 15),
            ),
            Remainder(
                id=rem_ids["emi"],
                name="EMI Payment Due — 3-Day Reminder",
                description="Remind customers of upcoming EMI payment due in 3 days.",
                connected_flow=flow_ids["emi_reminder"],
                remainder_type="Financial",
                header_message="📅 EMI Due in 3 Days",
                footer_message="Pay on time to avoid late fee.",
                message_body_type=MessageType.TEXT,
                message_body="Hi {{name}}, your EMI of ₹{{amount}} is due on {{due_date}}. Pay on time to avoid late charges. Reply EMIPAY for quick payment options.",
                is_active=True,
                created_by=neha_id, created_at=dt(2026, 1, 2),
            ),
            Remainder(
                id=rem_ids["wishlist"],
                name="Wishlist Price Drop Alert",
                description="Alert customers when a wishlisted item goes on sale.",
                connected_flow=flow_ids["festive"],
                remainder_type="Behavioural",
                header_message="🔔 Price Drop on Your Wishlist!",
                footer_message="Limited stock. Act fast!",
                message_body_type=MessageType.TEXT,
                message_body="Great news, {{name}}! An item on your wishlist just dropped in price. Don't miss out — grab it before it sells out. Reply FESTIVE to view.",
                is_active=True,
                created_by=arjun_id, created_at=dt(2026, 2, 1),
            ),
            Remainder(
                id=rem_ids["appointment"],
                name="Store Visit Appointment Reminder",
                description="Day-before reminder for customers with a scheduled store styling session.",
                connected_flow=None,
                remainder_type="Appointment",
                header_message="📍 Your Styling Session Tomorrow",
                footer_message="Aparoksha Retail — Indiranagar, Bengaluru",
                message_body_type=MessageType.TEXT,
                message_body="Hi {{name}}, just a reminder — your styling session at our Indiranagar store is tomorrow at {{time}}. See you there! Call 080-XXXX for any changes.",
                is_active=False,
                created_by=neha_id, created_at=dt(2026, 3, 1),
                modified_by=priya_id, modified_at=dt(2026, 4, 10),
            ),
        ]
        db.add_all(remainders)
        db.flush()
        print("Remainders created.")

        # ── CAMPAIGNS ────────────────────────────────────────────────────────
        camp_ids = {k: uid() for k in [
            "rep_day", "val_day", "womens", "holi_blast", "summer_wave1",
            "summer_wave2", "cart_nudge", "emi_q1", "points_expiry"
        ]}

        campaigns = [
            # --- Completed promotional campaigns ---
            Campaign(
                id=camp_ids["rep_day"],
                name="Republic Day Blast",
                is_active=False,
                schedule_at=dt(2026, 1, 25, 10, 0),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["republic"],
                flow=flow_ids["festive"],
                created_by=arjun_id, created_at=dt(2026, 1, 22),
                last_run_time=dt(2026, 1, 25, 10, 5),
                last_run_by=arjun_id, total_runs=1, repeat_count=0,
                metrics={"messages_sent": 4800, "delivered": 4512, "read": 2256, "flow_completed": 681},
            ),
            Campaign(
                id=camp_ids["val_day"],
                name="Valentine's Week Drive",
                is_active=False,
                schedule_at=dt(2026, 2, 10, 9, 0),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["valentine"],
                flow=flow_ids["flash_sale"],
                created_by=priya_id, created_at=dt(2026, 2, 7),
                last_run_time=dt(2026, 2, 14, 9, 3),
                last_run_by=priya_id, total_runs=2, repeat_count=1,
                repeat_interval_value=4, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 3600, "delivered": 3420, "read": 1881, "flow_completed": 564},
            ),
            Campaign(
                id=camp_ids["womens"],
                name="Women's Day Power Push",
                is_active=False,
                schedule_at=dt(2026, 3, 8, 8, 0),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["womens_day"],
                flow=flow_ids["loyalty"],
                created_by=neha_id, created_at=dt(2026, 3, 6),
                last_run_time=dt(2026, 3, 8, 8, 2),
                last_run_by=neha_id, total_runs=1, repeat_count=0,
                metrics={"messages_sent": 5200, "delivered": 4940, "read": 2964, "flow_completed": 1186},
            ),
            Campaign(
                id=camp_ids["holi_blast"],
                name="Holi Colour Blast",
                is_active=False,
                schedule_at=dt(2026, 3, 13, 11, 0),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["holi"],
                flow=flow_ids["festive"],
                created_by=arjun_id, created_at=dt(2026, 3, 11),
                last_run_time=dt(2026, 3, 13, 11, 1),
                last_run_by=arjun_id, total_runs=1, repeat_count=0,
                metrics={"messages_sent": 4100, "delivered": 3895, "read": 1947, "flow_completed": 585},
            ),
            # --- Active ongoing campaigns ---
            Campaign(
                id=camp_ids["summer_wave1"],
                name="Summer Wardrobe — Wave 1",
                is_active=True,
                schedule_at=dt(2026, 4, 5, 10, 0),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["summer"],
                flow=flow_ids["flash_sale"],
                created_by=priya_id, created_at=dt(2026, 4, 1),
                last_run_time=dt(2026, 4, 26, 10, 0),
                last_run_by=priya_id, total_runs=4, repeat_count=3,
                repeat_interval_value=7, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 18000, "delivered": 16920, "read": 9306, "flow_completed": 2797},
            ),
            Campaign(
                id=camp_ids["summer_wave2"],
                name="Summer Wardrobe — Wave 2 (New Arrivals)",
                is_active=True,
                schedule_at=dt(2026, 4, 22, 9, 30),
                activity_type=ActivityType.PROMOTION,
                activity_id=promo_ids["spring"],
                flow=flow_ids["loyalty"],
                created_by=priya_id, created_at=dt(2026, 4, 18),
                last_run_time=dt(2026, 4, 29, 9, 30),
                last_run_by=arjun_id, total_runs=2, repeat_count=1,
                repeat_interval_value=7, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 7200, "delivered": 6840, "read": 4104, "flow_completed": 1232},
            ),
            # --- Remainder campaigns ---
            Campaign(
                id=camp_ids["cart_nudge"],
                name="Cart Abandonment Daily Nudge",
                is_active=True,
                schedule_at=dt(2026, 1, 10, 14, 0),
                activity_type=ActivityType.REMAINDER,
                activity_id=rem_ids["cart"],
                flow=flow_ids["flash_sale"],
                created_by=arjun_id, created_at=dt(2026, 1, 8),
                last_run_time=dt(2026, 5, 6, 14, 0),
                last_run_by=arjun_id, total_runs=117, repeat_count=116,
                repeat_interval_value=1, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 28080, "delivered": 26676, "read": 13338, "flow_completed": 3868},
            ),
            Campaign(
                id=camp_ids["emi_q1"],
                name="EMI Reminder — Q1 2026",
                is_active=True,
                schedule_at=dt(2026, 1, 28, 9, 0),
                activity_type=ActivityType.REMAINDER,
                activity_id=rem_ids["emi"],
                flow=flow_ids["emi_reminder"],
                created_by=neha_id, created_at=dt(2026, 1, 25),
                last_run_time=dt(2026, 4, 28, 9, 0),
                last_run_by=neha_id, total_runs=3, repeat_count=2,
                repeat_interval_value=30, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 2700, "delivered": 2619, "read": 2358, "flow_completed": 1887},
            ),
            Campaign(
                id=camp_ids["points_expiry"],
                name="Loyalty Points Expiry — Monthly",
                is_active=True,
                schedule_at=dt(2026, 1, 26, 10, 0),
                activity_type=ActivityType.REMAINDER,
                activity_id=rem_ids["loyalty_points"],
                flow=flow_ids["loyalty"],
                created_by=priya_id, created_at=dt(2026, 1, 24),
                last_run_time=dt(2026, 4, 26, 10, 0),
                last_run_by=priya_id, total_runs=4, repeat_count=3,
                repeat_interval_value=30, repeat_interval_unit=IntervalUnit.DAYS,
                metrics={"messages_sent": 6800, "delivered": 6528, "read": 5878, "flow_completed": 3820},
            ),
        ]
        db.add_all(campaigns)
        db.flush()
        print("Campaigns created.")

        # ── CAMPAIGN JOBS ────────────────────────────────────────────────────
        # We'll create 2–3 jobs per campaign (latest ones) with realistic data
        job_specs = [
            # republic_day — 1 run
            dict(cid=camp_ids["rep_day"], scheduled=dt(2026,1,25,10,0), status="Completed",
                 targets=4800, attempted=4800, failed=288, delivered=4512, unread=2256,
                 fc=681, cutoffs=3831, created=dt(2026,1,25,10,0)),
            # valentines — 2 runs
            dict(cid=camp_ids["val_day"], scheduled=dt(2026,2,10,9,0), status="Completed",
                 targets=1800, attempted=1800, failed=90,  delivered=1710, unread=855,
                 fc=257, cutoffs=1453, created=dt(2026,2,10,9,0)),
            dict(cid=camp_ids["val_day"], scheduled=dt(2026,2,14,9,0), status="Completed",
                 targets=1800, attempted=1800, failed=90,  delivered=1710, unread=1026,
                 fc=307, cutoffs=1403, created=dt(2026,2,14,9,0)),
            # womens day — 1 run
            dict(cid=camp_ids["womens"], scheduled=dt(2026,3,8,8,0), status="Completed",
                 targets=5200, attempted=5200, failed=260, delivered=4940, unread=1976,
                 fc=1186, cutoffs=3754, created=dt(2026,3,8,8,0)),
            # holi blast — 1 run
            dict(cid=camp_ids["holi_blast"], scheduled=dt(2026,3,13,11,0), status="Completed",
                 targets=4100, attempted=4100, failed=205, delivered=3895, unread=1948,
                 fc=585,  cutoffs=3310, created=dt(2026,3,13,11,0)),
            # summer wave1 — last 2 of 4 runs
            dict(cid=camp_ids["summer_wave1"], scheduled=dt(2026,4,19,10,0), status="Completed",
                 targets=4500, attempted=4500, failed=225, delivered=4275, unread=2351,
                 fc=699, cutoffs=3576, created=dt(2026,4,19,10,0)),
            dict(cid=camp_ids["summer_wave1"], scheduled=dt(2026,4,26,10,0), status="Completed",
                 targets=4500, attempted=4500, failed=225, delivered=4275, unread=2138,
                 fc=641, cutoffs=3634, created=dt(2026,4,26,10,0)),
            # summer wave2 — 2 runs
            dict(cid=camp_ids["summer_wave2"], scheduled=dt(2026,4,22,9,30), status="Completed",
                 targets=3600, attempted=3600, failed=180, delivered=3420, unread=1710,
                 fc=513, cutoffs=2907, created=dt(2026,4,22,9,30)),
            dict(cid=camp_ids["summer_wave2"], scheduled=dt(2026,4,29,9,30), status="Completed",
                 targets=3600, attempted=3600, failed=180, delivered=3420, unread=2394,
                 fc=719, cutoffs=2701, created=dt(2026,4,29,9,30)),
            # cart nudge — last 3 days
            dict(cid=camp_ids["cart_nudge"], scheduled=dt(2026,5,4,14,0), status="Completed",
                 targets=240, attempted=240, failed=12, delivered=228, unread=114,
                 fc=33, cutoffs=195, created=dt(2026,5,4,14,0)),
            dict(cid=camp_ids["cart_nudge"], scheduled=dt(2026,5,5,14,0), status="Completed",
                 targets=240, attempted=240, failed=12, delivered=228, unread=114,
                 fc=34, cutoffs=194, created=dt(2026,5,5,14,0)),
            dict(cid=camp_ids["cart_nudge"], scheduled=dt(2026,5,6,14,0), status="Completed",
                 targets=240, attempted=240, failed=12, delivered=228, unread=114,
                 fc=33, cutoffs=195, created=dt(2026,5,6,14,0)),
            # emi_q1 — 3 monthly runs
            dict(cid=camp_ids["emi_q1"], scheduled=dt(2026,2,28,9,0), status="Completed",
                 targets=900, attempted=900, failed=27, delivered=873, unread=87,
                 fc=629, cutoffs=244, created=dt(2026,2,28,9,0)),
            dict(cid=camp_ids["emi_q1"], scheduled=dt(2026,3,28,9,0), status="Completed",
                 targets=900, attempted=900, failed=27, delivered=873, unread=87,
                 fc=628, cutoffs=245, created=dt(2026,3,28,9,0)),
            dict(cid=camp_ids["emi_q1"], scheduled=dt(2026,4,28,9,0), status="Completed",
                 targets=900, attempted=900, failed=27, delivered=873, unread=87,
                 fc=630, cutoffs=243, created=dt(2026,4,28,9,0)),
            # points_expiry — 4 monthly runs
            dict(cid=camp_ids["points_expiry"], scheduled=dt(2026,1,26,10,0), status="Completed",
                 targets=1700, attempted=1700, failed=68, delivered=1632, unread=163,
                 fc=956, cutoffs=676, created=dt(2026,1,26,10,0)),
            dict(cid=camp_ids["points_expiry"], scheduled=dt(2026,2,25,10,0), status="Completed",
                 targets=1700, attempted=1700, failed=68, delivered=1632, unread=163,
                 fc=956, cutoffs=676, created=dt(2026,2,25,10,0)),
            dict(cid=camp_ids["points_expiry"], scheduled=dt(2026,3,26,10,0), status="Completed",
                 targets=1700, attempted=1700, failed=68, delivered=1632, unread=163,
                 fc=954, cutoffs=678, created=dt(2026,3,26,10,0)),
            dict(cid=camp_ids["points_expiry"], scheduled=dt(2026,4,26,10,0), status="Completed",
                 targets=1700, attempted=1700, failed=68, delivered=1632, unread=163,
                 fc=954, cutoffs=678, created=dt(2026,4,26,10,0)),
        ]

        job_ids = []
        metrics_rows = []
        for spec in job_specs:
            jid = uid()
            job_ids.append(jid)
            job = CampaignJob(
                id=jid,
                campaign_id=spec["cid"],
                schedule_time=spec["scheduled"],
                retry_interval=300,
                retry_attempts=3,
                status=spec["status"],
                created_at=spec["created"],
                updated_at=spec["created"] + datetime.timedelta(minutes=random.randint(10, 60)),
            )
            db.add(job)
            metrics_rows.append(CampaignMetrics(
                id=uid(),
                campaign_job_id=jid,
                total_users_targeted=spec["targets"],
                messages_attempted=spec["attempted"],
                messages_failed=spec["failed"],
                messages_delivered=spec["delivered"],
                messages_unread=spec["unread"],
                flow_completed=spec["fc"],
                flow_cutoffs=spec["cutoffs"],
                created_at=spec["created"],
            ))
        db.add_all(metrics_rows)
        db.flush()
        print(f"Campaign jobs ({len(job_ids)}) and metrics created.")

        # ── CONVERSATION METADATA ────────────────────────────────────────────
        # Sample customer names for realistic entries
        NAMES = [
            "Ananya Reddy", "Karan Kapoor", "Deepika Nair", "Rohit Verma",
            "Sneha Kulkarni", "Amit Joshi", "Meera Iyer", "Suresh Kumar",
            "Pooja Singh", "Vikram Malhotra", "Divya Sharma", "Rahul Gupta",
            "Lakshmi Pillai", "Aditya Patel", "Nandini Rao",
        ]

        steps = ["greeting", "product_browse", "size_selection", "offer_applied",
                 "add_to_cart", "checkout", "payment_pending"]

        conv_meta_rows = []
        # Create 5–8 sample conversations per job for the first 8 jobs
        for jid in job_ids[:8]:
            for _ in range(random.randint(5, 8)):
                name  = random.choice(NAMES)
                phone = rand_phone()
                sent  = random.randint(3, 12)
                deliv = sent - random.randint(0, 1)
                read  = deliv - random.randint(0, 2)
                failed = sent - deliv
                completed = random.choice([True, False, False])
                cutoff = None if completed else random.choice(steps[2:])
                conv_meta_rows.append(CampaignUserConversationMetadata(
                    id=uid(),
                    campaign_job_id=jid,
                    phone_no=phone,
                    flow_id=random.choice(list(flow_ids.values())),
                    flow_completed=completed,
                    cutoff_step=cutoff,
                    total_messages_sent=sent,
                    total_messages_delivered=deliv,
                    total_messages_failed=failed,
                    total_messages_read=read,
                    last_message_at=datetime.datetime.now() - datetime.timedelta(days=random.randint(1, 30)),
                    total_time_spent=rand_td(),
                    created_at=datetime.datetime.now() - datetime.timedelta(days=random.randint(1, 30)),
                    message_history=[
                        {"role": "bot",  "text": f"Hi {name.split()[0]}! Welcome to Aparoksha Retail 👋", "ts": "10:00"},
                        {"role": "user", "text": "Hi",  "ts": "10:01"},
                        {"role": "bot",  "text": "Here's what we have for you today...", "ts": "10:01"},
                    ] if sent >= 3 else [],
                ))

        db.add_all(conv_meta_rows)
        db.commit()
        print(f"Conversation metadata created ({len(conv_meta_rows)} records).")
        print("\n✅ Seed complete — Aparoksha Retail demo data loaded.")

    except Exception as e:
        db.rollback()
        print(f"❌ Seed failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
