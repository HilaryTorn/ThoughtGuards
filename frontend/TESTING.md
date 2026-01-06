# Testing Guide

This document explains how to test the application using automation attributes.

## Automation Attributes

All interactive elements have `data-testid` and `data-automation` attributes for easy testing:

- **`data-testid`**: Standard testing attribute (compatible with React Testing Library, Playwright, etc.)
- **`data-automation`**: Custom attribute for automation tools

## Available Test IDs

### Settings Page

- `sync-conversations-button` - Button to start syncing conversations
- `cancel-sync-button` - Button to cancel an ongoing sync
- `sync-show-details-button` - Button to show/hide sync details
- `database-management-section` - The database management section container
- `settings-section-{section-id}` - Navigation buttons for each section (e.g., `settings-section-database-management`)

## Usage Examples

### Browser Console

```javascript
// Query element by test ID
const syncButton = document.querySelector('[data-testid="sync-conversations-button"]');
syncButton?.click();

// Or use the helper functions (if loaded)
import { getByTestId, clickByTestId } from './lib/test-helpers';
clickByTestId('sync-conversations-button');
```

### Playwright

```typescript
import { test, expect } from '@playwright/test';

test('sync conversations', async ({ page }) => {
  await page.goto('http://localhost:3014/#settings/database-management');
  
  // Click sync button
  await page.click('[data-testid="sync-conversations-button"]');
  
  // Wait for sync to start
  await page.waitForSelector('[data-testid="cancel-sync-button"]');
  
  // Check progress
  const progress = await page.textContent('[data-testid="database-management-section"]');
  expect(progress).toContain('Syncing');
});
```

### React Testing Library

```typescript
import { render, screen } from '@testing-library/react';
import Settings from './components/Settings';

test('sync button is clickable', () => {
  render(<Settings settings={mockSettings} onUpdate={jest.fn()} />);
  
  const syncButton = screen.getByTestId('sync-conversations-button');
  expect(syncButton).toBeInTheDocument();
  expect(syncButton).not.toBeDisabled();
  
  fireEvent.click(syncButton);
  // Assert sync started
});
```

### Cypress

```javascript
describe('Database Sync', () => {
  it('should sync conversations', () => {
    cy.visit('http://localhost:3014/#settings/database-management');
    
    cy.get('[data-testid="sync-conversations-button"]').click();
    cy.get('[data-testid="cancel-sync-button"]').should('be.visible');
    
    // Wait for completion
    cy.get('[data-testid="sync-conversations-button"]', { timeout: 60000 })
      .should('not.have.class', 'disabled');
  });
});
```

### Manual Testing in Browser Console

```javascript
// Load test helpers
const script = document.createElement('script');
script.src = '/lib/test-helpers.js'; // If compiled separately
// Or just use querySelector directly:

// Click sync button
document.querySelector('[data-testid="sync-conversations-button"]')?.click();

// Check if sync is running
document.querySelector('[data-testid="cancel-sync-button"]') !== null;

// Get all test IDs on page
Array.from(document.querySelectorAll('[data-testid]'))
  .map(el => el.getAttribute('data-testid'));
```

## Best Practices

1. **Always use data-testid for testing** - Don't rely on CSS classes or text content
2. **Use semantic test IDs** - Make them descriptive (e.g., `sync-conversations-button` not `btn1`)
3. **Keep test IDs stable** - Don't change them unless the functionality changes
4. **Use aria-label for accessibility** - Test IDs are for automation, aria-label is for screen readers

## Adding New Test IDs

When adding new interactive elements, always include:

```tsx
<button
  data-testid="my-action-button"
  data-automation="my-action-button"
  aria-label="Descriptive label for screen readers"
  onClick={handleClick}
>
  Button Text
</button>
```

## Debugging

To see all available test IDs on the current page:

```javascript
// In browser console
Array.from(document.querySelectorAll('[data-testid]'))
  .map(el => ({
    testId: el.getAttribute('data-testid'),
    tag: el.tagName,
    text: el.textContent?.trim().substring(0, 50)
  }));
```

