/**
 * Generate unique report IDs
 */

/**
 * Generate a unique report ID
 * Format: report-{conversation_id}-{timestamp}-{hash}
 */
export function generateReportId(
  conversationId: string,
  timestamp: string,
  paramsHash: string
): string {
  // Extract timestamp part (ISO string without colons)
  const timestampPart = timestamp.replace(/[:.]/g, '-').substring(0, 19);
  const shortHash = paramsHash.substring(0, 8);
  return `report-${conversationId}-${timestampPart}-${shortHash}`;
}

/**
 * Parse report ID to extract components
 */
export function parseReportId(reportId: string): {
  conversationId: string;
  timestamp: string;
  hash: string;
} | null {
  const match = reportId.match(/^report-(.+)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})-(.+)$/);
  if (!match) {
    return null;
  }
  
  return {
    conversationId: match[1],
    timestamp: match[2].replace(/-/g, ':').replace('T', 'T'),
    hash: match[3]
  };
}

