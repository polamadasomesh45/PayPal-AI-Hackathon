"""
Authoritative Server-Side Product Catalog for PayGuard.

The LLM is strictly isolated from pricing. All prices, product names, and categories
are resolved exclusively from this immutable server-side catalog.
"""

from typing import Dict, List, TypedDict


class CatalogItem(TypedDict):
    sku: str
    name: str
    category: str
    price_usd: float
    description: str
    tier_hint: str
    keywords: List[str]


CATALOG_DB: Dict[str, CatalogItem] = {
    # -------------------------------------------------------------------------
    # Tier 1 Candidates (< $25.00 when ordered individually)
    # -------------------------------------------------------------------------
    "SKU-CAM-COV": {
        "sku": "SKU-CAM-COV",
        "name": "Webcam Privacy Slider",
        "category": "Security Accessories",
        "price_usd": 5.00,
        "description": "Ultra-thin anodized aluminum physical webcam privacy cover (3-pack).",
        "tier_hint": "TIER_1_AUTO",
        "keywords": ["webcam", "privacy", "cover", "slider", "camera cover", "shutter"],
    },
    "SKU-USB-CBL": {
        "sku": "SKU-USB-CBL",
        "name": "Braided USB-C Data Blocker Cable",
        "category": "Cables & Adapters",
        "price_usd": 9.50,
        "description": "Charge-only USB-C cable with hardware data-pin isolation against juice jacking.",
        "tier_hint": "TIER_1_AUTO",
        "keywords": ["cable", "usb-c cable", "cord", "charger", "data blocker", "braided"],
    },
    "SKU-SEC-KEY": {
        "sku": "SKU-SEC-KEY",
        "name": "FIDO2 USB-C Security Key",
        "category": "Hardware Authentication",
        "price_usd": 15.00,
        "description": "Hardware WebAuthn/FIDO2 cryptographic security token for zero-trust MFA.",
        "tier_hint": "TIER_1_AUTO",
        "keywords": ["security key", "fido2", "yubikey", "usb-c security key", "token", "mfa key", "key"],
    },
    "SKU-DESK-MAT": {
        "sku": "SKU-DESK-MAT",
        "name": "Anti-Static Developer Desk Mat",
        "category": "Workspace",
        "price_usd": 18.00,
        "description": "Water-resistant microfiber desk pad with Git & Linux kernel shortcut reference.",
        "tier_hint": "TIER_1_AUTO",
        "keywords": ["desk mat", "mousepad", "mouse pad", "mat", "pad"],
    },
    "SKU-WRLS-MSE": {
        "sku": "SKU-WRLS-MSE",
        "name": "Ergonomic Wireless Mouse",
        "category": "Peripherals",
        "price_usd": 22.00,
        "description": "Low-latency 2.4GHz & Bluetooth silent-click optical wireless mouse.",
        "tier_hint": "TIER_1_AUTO",
        "keywords": ["wireless mouse", "wireless mice", "mouse", "mice", "optical mouse"],
    },

    # -------------------------------------------------------------------------
    # Tier 2 Candidates ($25.00 - $200.00 -> Requires 30s HMAC Step-Up)
    # -------------------------------------------------------------------------
    "SKU-USBC-HUB": {
        "sku": "SKU-USBC-HUB",
        "name": "7-in-1 Thunderbolt USB-C Dock",
        "category": "Peripherals",
        "price_usd": 45.00,
        "description": "Aluminum USB-C hub with 4K HDMI, Gigabit Ethernet, 100W PD, and SD card reader.",
        "tier_hint": "TIER_2_STEP_UP",
        "keywords": ["usb-c hub", "dock", "thunderbolt", "adapter", "hub", "dongle"],
    },
    "SKU-MECH-KB": {
        "sku": "SKU-MECH-KB",
        "name": "Developer Mechanical Keyboard",
        "category": "Peripherals",
        "price_usd": 85.00,
        "description": "Hot-swappable 75% tactile mechanical keyboard with PBT keycaps and QMK/VIA firmware.",
        "tier_hint": "TIER_2_STEP_UP",
        "keywords": ["mechanical keyboard", "keyboard", "keyboards", "mech keyboard", "qmk"],
    },
    "SKU-ANC-HDP": {
        "sku": "SKU-ANC-HDP",
        "name": "Studio ANC Wireless Headphones",
        "category": "Audio",
        "price_usd": 140.00,
        "description": "Over-ear active noise cancelling headphones with 40-hour battery and dual-device pairing.",
        "tier_hint": "TIER_2_STEP_UP",
        "keywords": ["headphones", "headset", "anc", "earphones", "audio", "noise cancelling"],
    },
    "SKU-NVME-2TB": {
        "sku": "SKU-NVME-2TB",
        "name": "Encrypted 2TB NVMe External SSD",
        "category": "Storage",
        "price_usd": 175.00,
        "description": "Hardware AES-256 encrypted USB 3.2 Gen 2x2 portable solid state drive.",
        "tier_hint": "TIER_2_STEP_UP",
        "keywords": ["ssd", "nvme", "external drive", "storage", "hard drive", "2tb"],
    },

    # -------------------------------------------------------------------------
    # Tier 3 Candidates (> $200.00 -> Exceeds Autonomous Budget Cap)
    # -------------------------------------------------------------------------
    "SKU-4K-MON": {
        "sku": "SKU-4K-MON",
        "name": "27-Inch 4K UltraSharp IPS Monitor",
        "category": "Displays",
        "price_usd": 350.00,
        "description": "99% sRGB factory-calibrated 4K UHD monitor with 90W USB-C power delivery.",
        "tier_hint": "TIER_3_BLOCKED",
        "keywords": ["4k monitor", "monitor", "display", "screen", "ultrasharp", "27-inch"],
    },
    "SKU-GPU-AI": {
        "sku": "SKU-GPU-AI",
        "name": "Edge AI Workstation eGPU Enclosure",
        "category": "Compute Hardware",
        "price_usd": 699.00,
        "description": "External Thunderbolt 4 GPU accelerator chassis with 24GB VRAM card.",
        "tier_hint": "TIER_3_BLOCKED",
        "keywords": ["gpu", "egpu", "graphics card", "ai accelerator"],
    },
    "SKU-LAPTOP-PRO": {
        "sku": "SKU-LAPTOP-PRO",
        "name": "Developer Workstation Laptop Pro 16",
        "category": "Compute Hardware",
        "price_usd": 1899.00,
        "description": "16-inch flagship developer laptop with 64GB unified memory and 2TB SSD.",
        "tier_hint": "TIER_3_BLOCKED",
        "keywords": ["laptop", "laptop pro", "workstation", "macbook", "notebook"],
    },
}


def get_catalog_list() -> List[Dict]:
    """Return the authoritative catalog list formatted for API and UI consumption."""
    return [
        {
            "sku": item["sku"],
            "name": item["name"],
            "category": item["category"],
            "price_usd": item["price_usd"],
            "description": item["description"],
            "tier_hint": item["tier_hint"],
        }
        for item in CATALOG_DB.values()
    ]


def build_llm_catalog_reference() -> str:
    """
    Build a strictly price-free catalog reference string for the LLM system prompt.
    Notice: Prices are intentionally omitted so the LLM has zero visibility into item costs!
    """
    lines = []
    for sku, item in CATALOG_DB.items():
        aliases = ", ".join(item["keywords"])
        lines.append(f'- SKU: "{sku}" | Name: "{item["name"]}" | Category: {item["category"]} | Keywords: [{aliases}]')
    return "\n".join(lines)
