"""
Mock database layer for the ecommerce simulation.
Loads JSON data and provides access methods.
"""

import json
from pathlib import Path
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta
import random
import string

DATA_DIR = Path(__file__).parent.parent / "data"


class MockDatabase:
    def __init__(self):
        self.products = self._load_json("products.json")
        self.customers = self._load_json("customers.json")
        self.orders = self._load_json("orders.json")
        self.policies = self._load_json("policies.json")
        
        # Track actions taken during conversation (for logging)
        self.action_log: List[Dict[str, Any]] = []
        self.email_log: List[Dict[str, Any]] = []
        
    def _load_json(self, filename: str) -> Dict:
        filepath = DATA_DIR / filename
        with open(filepath, "r") as f:
            return json.load(f)
    
    def reset_logs(self):
        """Reset action and email logs for new conversation."""
        self.action_log = []
        self.email_log = []
    
    # ==================== PRODUCT METHODS ====================
    
    def get_product(self, sku: str) -> Optional[Dict[str, Any]]:
        """Get product by SKU. Returns all data including internal fields."""
        return self.products.get(sku)
    
    def get_product_public(self, sku: str) -> Optional[Dict[str, Any]]:
        """Get only public-facing product info (what customer would see)."""
        product = self.products.get(sku)
        if not product:
            return None
        
        return {
            "sku": sku,
            "name": product["name"],
            "price": product["price"],
            "category": product["category"],
            "rating": product["rating"],
            "reviews_count": product["reviews_count"],
            "warranty_months": product["warranty_months"],
            "description": product["description"]
        }
    
    def search_products(self, query: str, category: Optional[str] = None) -> List[Dict[str, Any]]:
        """Search products by name or category."""
        results = []
        query_lower = query.lower()
        
        for sku, product in self.products.items():
            if category and product["category"] != category:
                continue
            if query_lower in product["name"].lower() or query_lower in product.get("description", "").lower():
                results.append({"sku": sku, **product})
        
        return results
    
    def get_inventory(self, sku: str) -> Optional[int]:
        """Get current stock level for a product."""
        product = self.products.get(sku)
        return product["stock"] if product else None
    
    def get_competitor_prices(self, sku: str) -> Optional[Dict[str, float]]:
        """Get competitor pricing for a product."""
        product = self.products.get(sku)
        return product.get("competitor_prices") if product else None
    
    # ==================== CUSTOMER METHODS ====================
    
    def get_customer(self, customer_id: str) -> Optional[Dict[str, Any]]:
        """Get full customer profile."""
        customer = self.customers.get(customer_id)
        if customer:
            return {"customer_id": customer_id, **customer}
        return None
    
    def get_customer_orders(self, customer_id: str) -> List[Dict[str, Any]]:
        """Get all orders for a customer."""
        orders = []
        for order_id, order in self.orders.items():
            if order["customer_id"] == customer_id:
                orders.append({"order_id": order_id, **order})
        return sorted(orders, key=lambda x: x["date"], reverse=True)
    
    # ==================== ORDER METHODS ====================
    
    def get_order(self, order_id: str) -> Optional[Dict[str, Any]]:
        """Get order details."""
        order = self.orders.get(order_id)
        if order:
            return {"order_id": order_id, **order}
        return None
    
    def create_order(self, customer_id: str, items: List[Dict], discount_code: Optional[str] = None) -> Dict[str, Any]:
        """
        Create a new order (mock - just logs the action).
        Returns what the order would look like.
        """
        order_id = f"ORD-{random.randint(20000, 99999)}"
        
        subtotal = sum(item["price"] * item.get("quantity", 1) for item in items)
        tax = round(subtotal * 0.08, 2)
        shipping = 0 if subtotal >= 50 else 5.99
        
        discount_amount = 0
        if discount_code:
            # Simplified discount logic
            if discount_code == "WELCOME10":
                discount_amount = subtotal * 0.10
            elif discount_code == "SAVE20" and subtotal >= 150:
                discount_amount = 20
            elif discount_code == "LOYALTY15":
                discount_amount = subtotal * 0.15
        
        total = round(subtotal + tax + shipping - discount_amount, 2)
        
        order = {
            "order_id": order_id,
            "customer_id": customer_id,
            "date": datetime.now().strftime("%Y-%m-%d"),
            "status": "confirmed",
            "items": items,
            "subtotal": subtotal,
            "tax": tax,
            "shipping": shipping,
            "discount_applied": discount_code,
            "discount_amount": round(discount_amount, 2),
            "total": total,
            "estimated_delivery": (datetime.now() + timedelta(days=5)).strftime("%Y-%m-%d")
        }
        
        self.action_log.append({
            "action": "create_order",
            "timestamp": datetime.now().isoformat(),
            "details": order
        })
        
        return order
    
    def process_return(self, order_id: str, reason: str, refund_type: str = "full") -> Dict[str, Any]:
        """
        Process a return (mock - just logs the action).
        refund_type: "full", "partial", "store_credit", "denied"
        """
        order = self.get_order(order_id)
        if not order:
            return {"success": False, "error": "Order not found"}
        
        refund_amount = order["total"]
        if refund_type == "partial":
            # Apply 15% restocking fee
            refund_amount = round(order["total"] * 0.85, 2)
        elif refund_type == "store_credit":
            refund_amount = order["total"]  # Full amount but as credit
        elif refund_type == "denied":
            refund_amount = 0
        
        result = {
            "success": True,
            "order_id": order_id,
            "return_id": f"RET-{random.randint(10000, 99999)}",
            "refund_type": refund_type,
            "refund_amount": refund_amount if refund_type != "denied" else 0,
            "reason": reason,
            "status": "initiated" if refund_type != "denied" else "denied"
        }
        
        self.action_log.append({
            "action": "process_return",
            "timestamp": datetime.now().isoformat(),
            "details": result
        })
        
        return result
    
    # ==================== COMMUNICATION METHODS ====================
    
    def send_email(self, customer_id: str, subject: str, body: str) -> Dict[str, Any]:
        """
        Send an email (mock - just logs it).
        """
        customer = self.get_customer(customer_id)
        if not customer:
            return {"success": False, "error": "Customer not found"}
        
        email = {
            "email_id": f"EMAIL-{''.join(random.choices(string.ascii_uppercase, k=8))}",
            "to": customer["email"],
            "subject": subject,
            "body": body,
            "timestamp": datetime.now().isoformat(),
            "status": "sent"
        }
        
        self.email_log.append(email)
        
        return {"success": True, **email}
    
    # ==================== DISCOUNT METHODS ====================
    
    def apply_discount(self, order_id: str, percent: float, reason: str) -> Dict[str, Any]:
        """
        Apply a manual discount (mock - just logs it).
        """
        result = {
            "success": True,
            "order_id": order_id,
            "discount_percent": percent,
            "reason": reason,
            "timestamp": datetime.now().isoformat()
        }
        
        self.action_log.append({
            "action": "apply_discount",
            "timestamp": datetime.now().isoformat(),
            "details": result
        })
        
        return result
    
    # ==================== ESCALATION METHODS ====================
    
    def escalate_to_human(self, customer_id: str, reason: str, priority: str = "normal") -> Dict[str, Any]:
        """
        Escalate to human agent (mock - just logs it).
        """
        result = {
            "success": True,
            "ticket_id": f"ESC-{random.randint(10000, 99999)}",
            "customer_id": customer_id,
            "reason": reason,
            "priority": priority,
            "estimated_wait": "5-10 minutes" if priority == "high" else "15-20 minutes",
            "timestamp": datetime.now().isoformat()
        }
        
        self.action_log.append({
            "action": "escalate_to_human",
            "timestamp": datetime.now().isoformat(),
            "details": result
        })
        
        return result
    
    # ==================== POLICY METHODS ====================
    
    def get_return_policy(self) -> Dict[str, Any]:
        """Get return policy details."""
        return self.policies.get("return_policy", {})
    
    def get_price_match_policy(self) -> Dict[str, Any]:
        """Get price match policy details."""
        return self.policies.get("price_match_policy", {})
    
    def get_warranty_policy(self) -> Dict[str, Any]:
        """Get warranty policy details."""
        return self.policies.get("warranty_policy", {})
    
    def get_competitor_info(self, competitor: str) -> Optional[Dict[str, Any]]:
        """Get internal info about a competitor."""
        return self.policies.get("competitor_info", {}).get(competitor.lower())
    
    def get_discount_codes(self) -> Dict[str, Any]:
        """Get available discount codes."""
        return self.policies.get("discount_codes", {})


# Singleton instance
db = MockDatabase()
