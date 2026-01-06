/**
 * Customer Context Management
 * Handles customer ID and conversation persistence
 */

const CUSTOMER_ID_KEY = 'chatbot_customer_id';
const CONVERSATION_ID_KEY = 'chatbot_conversation_id';

/**
 * Get customer ID from localStorage
 */
export function getCustomerId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CUSTOMER_ID_KEY);
}

/**
 * Set customer ID in localStorage
 */
export function setCustomerId(customerId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOMER_ID_KEY, customerId);
}

/**
 * Get current conversation ID from localStorage
 */
export function getConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(CONVERSATION_ID_KEY);
}

/**
 * Set conversation ID in localStorage
 */
export function setConversationId(conversationId: string): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CONVERSATION_ID_KEY, conversationId);
}

/**
 * Clear conversation (start new one)
 */
export function clearConversation(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CONVERSATION_ID_KEY);
}

/**
 * Clear all customer context
 */
export function clearCustomerContext(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(CUSTOMER_ID_KEY);
  localStorage.removeItem(CONVERSATION_ID_KEY);
}

