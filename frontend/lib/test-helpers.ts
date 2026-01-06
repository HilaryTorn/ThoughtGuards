/**
 * Test Helpers for Automation
 * 
 * These utilities make it easy to query and interact with elements
 * that have data-testid or data-automation attributes.
 * 
 * Usage:
 *   import { getByTestId, getByAutomation } from '../lib/test-helpers';
 *   
 *   const button = getByTestId('sync-conversations-button');
 *   button.click();
 */

/**
 * Query element by data-testid attribute
 */
export function getByTestId(testId: string): HTMLElement | null {
  return document.querySelector(`[data-testid="${testId}"]`) as HTMLElement | null;
}

/**
 * Query element by data-automation attribute
 */
export function getByAutomation(automationId: string): HTMLElement | null {
  return document.querySelector(`[data-automation="${automationId}"]`) as HTMLElement | null;
}

/**
 * Query all elements by data-testid attribute
 */
export function getAllByTestId(testId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(`[data-testid="${testId}"]`)) as HTMLElement[];
}

/**
 * Query all elements by data-automation attribute
 */
export function getAllByAutomation(automationId: string): HTMLElement[] {
  return Array.from(document.querySelectorAll(`[data-automation="${automationId}"]`)) as HTMLElement[];
}

/**
 * Wait for element with testId to appear (useful for async rendering)
 */
export function waitForTestId(
  testId: string,
  timeout: number = 5000
): Promise<HTMLElement> {
  return new Promise((resolve, reject) => {
    const element = getByTestId(testId);
    if (element) {
      resolve(element);
      return;
    }

    const observer = new MutationObserver(() => {
      const element = getByTestId(testId);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element with data-testid="${testId}" not found within ${timeout}ms`));
    }, timeout);
  });
}

/**
 * Get element text content by testId
 */
export function getTextByTestId(testId: string): string | null {
  const element = getByTestId(testId);
  return element?.textContent?.trim() || null;
}

/**
 * Check if element with testId exists
 */
export function hasTestId(testId: string): boolean {
  return getByTestId(testId) !== null;
}

/**
 * Click element by testId
 */
export function clickByTestId(testId: string): void {
  const element = getByTestId(testId);
  if (!element) {
    throw new Error(`Element with data-testid="${testId}" not found`);
  }
  if (element instanceof HTMLButtonElement || element instanceof HTMLElement) {
    element.click();
  } else {
    throw new Error(`Element with data-testid="${testId}" is not clickable`);
  }
}

/**
 * Get all available test IDs on the page (for debugging)
 */
export function getAllTestIds(): string[] {
  const elements = document.querySelectorAll('[data-testid]');
  return Array.from(elements).map(el => el.getAttribute('data-testid') || '').filter(Boolean);
}

/**
 * Get all available automation IDs on the page (for debugging)
 */
export function getAllAutomationIds(): string[] {
  const elements = document.querySelectorAll('[data-automation]');
  return Array.from(elements).map(el => el.getAttribute('data-automation') || '').filter(Boolean);
}

