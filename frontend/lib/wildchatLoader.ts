/**
 * WildChat Dataset Loader
 * 
 * Integrates the WildChat Dataset (1M real ChatGPT conversations) for
 * ecological validity testing of manipulation detection.
 * 
 * Reference: WildChat Dataset - Real-world ChatGPT conversations
 * 
 * This loader provides:
 * - Dataset loading and filtering
 * - Sampling strategies for evaluation
 * - Conversion to our conversation format
 * - Comparison with synthetic test cases
 */

import { Conversation, EnrichedTestCase } from '../types';

export interface WildChatConversation {
  conversation_id: string;
  messages: Array<{
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: string;
  }>;
  metadata?: {
    source?: string;
    domain?: string;
    topic?: string;
    length?: number;
    date?: string;
    model?: string;
  };
}

export interface WildChatFilter {
  minTurns?: number;
  maxTurns?: number;
  minLength?: number; // Minimum total character length
  maxLength?: number; // Maximum total character length
  domains?: string[]; // Filter by domain/topic
  dateRange?: {
    start?: string; // ISO date string
    end?: string; // ISO date string
  };
  excludeDomains?: string[]; // Exclude specific domains
  includeKeywords?: string[]; // Must contain keywords
  excludeKeywords?: string[]; // Must not contain keywords
}

export interface WildChatSamplingConfig {
  totalSamples?: number; // Total number of conversations to sample
  stratifiedBy?: 'domain' | 'length' | 'date' | 'none'; // Stratification strategy
  randomSeed?: number; // For reproducible sampling
  balancedDomains?: boolean; // Ensure balanced domain distribution
  minSamplesPerDomain?: number; // Minimum samples per domain (if stratified)
}

/**
 * Load WildChat conversations from dataset
 * 
 * Note: In a full implementation, this would load from the actual WildChat dataset.
 * The dataset should be in JSON format with conversations.
 */
export async function loadWildChatDataset(
  filter?: WildChatFilter,
  samplingConfig?: WildChatSamplingConfig
): Promise<WildChatConversation[]> {
  // TODO: Load from actual WildChat dataset file
  // The dataset should be stored in a JSON file or fetched from a repository
  // Format: Array of WildChatConversation objects or JSONL format
  
  // Placeholder: Return empty array - actual implementation would load from file
  // Example structure:
  /*
  const conversations: WildChatConversation[] = [];
  
  // Load from JSON file
  const response = await fetch('/data/wildchat_dataset.json');
  const data = await response.json();
  
  // Or load from JSONL (one JSON object per line)
  const jsonlResponse = await fetch('/data/wildchat_dataset.jsonl');
  const jsonlText = await jsonlResponse.text();
  const lines = jsonlText.split('\n').filter(line => line.trim());
  const data = lines.map(line => JSON.parse(line));
  
  // Apply filters
  let filtered = data.filter(conv => matchesFilter(conv, filter));
  
  // Apply sampling
  const sampled = sampleConversations(filtered, samplingConfig);
  
  return sampled;
  */
  
  console.warn('WildChat dataset not loaded. Please provide the WildChat dataset file.');
  return [];
}

/**
 * Check if conversation matches filter criteria
 */
function matchesFilter(conversation: WildChatConversation, filter?: WildChatFilter): boolean {
  if (!filter) return true;
  
  const numTurns = conversation.messages.length;
  const totalLength = conversation.messages.reduce((sum, msg) => sum + msg.content.length, 0);
  
  // Filter by turn count
  if (filter.minTurns !== undefined && numTurns < filter.minTurns) return false;
  if (filter.maxTurns !== undefined && numTurns > filter.maxTurns) return false;
  
  // Filter by length
  if (filter.minLength !== undefined && totalLength < filter.minLength) return false;
  if (filter.maxLength !== undefined && totalLength > filter.maxLength) return false;
  
  // Filter by domain
  if (filter.domains && filter.domains.length > 0) {
    const convDomain = conversation.metadata?.domain || conversation.metadata?.topic;
    if (!convDomain || !filter.domains.includes(convDomain)) return false;
  }
  
  // Exclude domains
  if (filter.excludeDomains && filter.excludeDomains.length > 0) {
    const convDomain = conversation.metadata?.domain || conversation.metadata?.topic;
    if (convDomain && filter.excludeDomains.includes(convDomain)) return false;
  }
  
  // Filter by date range
  if (filter.dateRange) {
    const convDate = conversation.metadata?.date;
    if (convDate) {
      const date = new Date(convDate);
      if (filter.dateRange.start && date < new Date(filter.dateRange.start)) return false;
      if (filter.dateRange.end && date > new Date(filter.dateRange.end)) return false;
    }
  }
  
  // Filter by keywords
  const allContent = conversation.messages.map(m => m.content).join(' ').toLowerCase();
  
  if (filter.includeKeywords && filter.includeKeywords.length > 0) {
    const hasAllKeywords = filter.includeKeywords.every(keyword =>
      allContent.includes(keyword.toLowerCase())
    );
    if (!hasAllKeywords) return false;
  }
  
  if (filter.excludeKeywords && filter.excludeKeywords.length > 0) {
    const hasAnyExcluded = filter.excludeKeywords.some(keyword =>
      allContent.includes(keyword.toLowerCase())
    );
    if (hasAnyExcluded) return false;
  }
  
  return true;
}

/**
 * Sample conversations based on configuration
 */
function sampleConversations(
  conversations: WildChatConversation[],
  config?: WildChatSamplingConfig
): WildChatConversation[] {
  if (!config || !config.totalSamples) {
    return conversations;
  }
  
  const totalSamples = config.totalSamples;
  const seed = config.randomSeed || Math.random();
  
  // Simple random sampling
  if (!config.stratifiedBy || config.stratifiedBy === 'none') {
    return randomSample(conversations, totalSamples, seed);
  }
  
  // Stratified sampling
  if (config.stratifiedBy === 'domain') {
    return stratifiedSampleByDomain(conversations, totalSamples, config, seed);
  } else if (config.stratifiedBy === 'length') {
    return stratifiedSampleByLength(conversations, totalSamples, seed);
  } else if (config.stratifiedBy === 'date') {
    return stratifiedSampleByDate(conversations, totalSamples, seed);
  }
  
  return randomSample(conversations, totalSamples, seed);
}

/**
 * Simple random sampling
 */
function randomSample<T>(items: T[], n: number, seed: number): T[] {
  const shuffled = [...items];
  
  // Simple seeded shuffle (linear congruential generator)
  let rng = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    const j = rng % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

/**
 * Stratified sampling by domain
 */
function stratifiedSampleByDomain(
  conversations: WildChatConversation[],
  totalSamples: number,
  config: WildChatSamplingConfig,
  seed: number
): WildChatConversation[] {
  // Group by domain
  const byDomain = new Map<string, WildChatConversation[]>();
  
  conversations.forEach(conv => {
    const domain = conv.metadata?.domain || conv.metadata?.topic || 'unknown';
    if (!byDomain.has(domain)) {
      byDomain.set(domain, []);
    }
    byDomain.get(domain)!.push(conv);
  });
  
  const domains = Array.from(byDomain.keys());
  const samplesPerDomain = Math.floor(totalSamples / domains.length);
  const minSamples = config.minSamplesPerDomain || 1;
  
  const sampled: WildChatConversation[] = [];
  
  for (const domain of domains) {
    const domainConvs = byDomain.get(domain)!;
    const n = config.balancedDomains
      ? Math.max(minSamples, Math.min(samplesPerDomain, domainConvs.length))
      : Math.floor((domainConvs.length / conversations.length) * totalSamples);
    
    const domainSample = randomSample(domainConvs, n, seed + domain.charCodeAt(0));
    sampled.push(...domainSample);
  }
  
  // Fill remaining slots with random samples if needed
  if (sampled.length < totalSamples) {
    const remaining = totalSamples - sampled.length;
    const remainingConvs = conversations.filter(c => !sampled.includes(c));
    const additional = randomSample(remainingConvs, remaining, seed + 9999);
    sampled.push(...additional);
  }
  
  return sampled.slice(0, totalSamples);
}

/**
 * Stratified sampling by length (short, medium, long)
 */
function stratifiedSampleByLength(
  conversations: WildChatConversation[],
  totalSamples: number,
  seed: number
): WildChatConversation[] {
  // Calculate length percentiles
  const lengths = conversations.map(c =>
    c.messages.reduce((sum, m) => sum + m.content.length, 0)
  ).sort((a, b) => a - b);
  
  const p33 = lengths[Math.floor(lengths.length * 0.33)];
  const p66 = lengths[Math.floor(lengths.length * 0.66)];
  
  const short = conversations.filter(c => {
    const len = c.messages.reduce((sum, m) => sum + m.content.length, 0);
    return len <= p33;
  });
  
  const medium = conversations.filter(c => {
    const len = c.messages.reduce((sum, m) => sum + m.content.length, 0);
    return len > p33 && len <= p66;
  });
  
  const long = conversations.filter(c => {
    const len = c.messages.reduce((sum, m) => sum + m.content.length, 0);
    return len > p66;
  });
  
  const samplesPerGroup = Math.floor(totalSamples / 3);
  
  return [
    ...randomSample(short, samplesPerGroup, seed),
    ...randomSample(medium, samplesPerGroup, seed + 1),
    ...randomSample(long, samplesPerGroup, seed + 2)
  ].slice(0, totalSamples);
}

/**
 * Stratified sampling by date (time periods)
 */
function stratifiedSampleByDate(
  conversations: WildChatConversation[],
  totalSamples: number,
  seed: number
): WildChatConversation[] {
  // Group by date periods (if dates available)
  const withDates = conversations.filter(c => c.metadata?.date);
  const withoutDates = conversations.filter(c => !c.metadata?.date);
  
  if (withDates.length === 0) {
    return randomSample(conversations, totalSamples, seed);
  }
  
  // Sort by date and divide into periods
  const sorted = withDates.sort((a, b) => {
    const dateA = new Date(a.metadata!.date!).getTime();
    const dateB = new Date(b.metadata!.date!).getTime();
    return dateA - dateB;
  });
  
  const periodSize = Math.floor(sorted.length / 3);
  const period1 = sorted.slice(0, periodSize);
  const period2 = sorted.slice(periodSize, periodSize * 2);
  const period3 = sorted.slice(periodSize * 2);
  
  const samplesPerPeriod = Math.floor(totalSamples / 3);
  
  return [
    ...randomSample(period1, samplesPerPeriod, seed),
    ...randomSample(period2, samplesPerPeriod, seed + 1),
    ...randomSample(period3, samplesPerPeriod, seed + 2),
    ...randomSample(withoutDates, totalSamples % 3, seed + 3)
  ].slice(0, totalSamples);
}

/**
 * Convert WildChat conversation to our Conversation format
 */
export function convertWildChatToConversation(
  wildChat: WildChatConversation
): Conversation {
  return {
    conversation_id: wildChat.conversation_id,
    turns: wildChat.messages.map((msg, idx) => ({
      turn_number: idx + 1,
      role: msg.role === 'system' ? 'user' : msg.role, // Map system to user
      content: msg.content,
      timestamp: msg.timestamp || new Date().toISOString()
    })),
    metadata: {
      domain: wildChat.metadata?.domain || wildChat.metadata?.topic,
      model: wildChat.metadata?.model,
      timestamp: wildChat.metadata?.date,
      tags: ['wildchat', 'real_world']
    }
  };
}

/**
 * Convert WildChat conversation to EnrichedTestCase format
 */
export function convertWildChatToTestCase(
  wildChat: WildChatConversation,
  category: string = 'real_world'
): EnrichedTestCase {
  const conversation = convertWildChatToConversation(wildChat);
  
  return {
    ...conversation,
    displayName: `WildChat: ${wildChat.conversation_id}`,
    category,
    display_type: 'real_world',
    customer_id: wildChat.metadata?.source || 'wildchat'
  };
}

/**
 * Compare WildChat results with synthetic test cases
 */
export interface ComparisonResult {
  synthetic_count: number;
  wildchat_count: number;
  synthetic_avg_score: number;
  wildchat_avg_score: number;
  score_difference: number;
  detection_rate_synthetic: number;
  detection_rate_wildchat: number;
  domain_breakdown: Map<string, {
    synthetic: { count: number; avg_score: number };
    wildchat: { count: number; avg_score: number };
  }>;
}

export function compareWildChatWithSynthetic(
  wildchatResults: Array<{ conversation_id: string; score: number; domain?: string }>,
  syntheticResults: Array<{ conversation_id: string; score: number; domain?: string }>
): ComparisonResult {
  const syntheticAvg = syntheticResults.length > 0
    ? syntheticResults.reduce((sum, r) => sum + r.score, 0) / syntheticResults.length
    : 0;
  
  const wildchatAvg = wildchatResults.length > 0
    ? wildchatResults.reduce((sum, r) => sum + r.score, 0) / wildchatResults.length
    : 0;
  
  const syntheticDetections = syntheticResults.filter(r => r.score >= 0.5).length;
  const wildchatDetections = wildchatResults.filter(r => r.score >= 0.5).length;
  
  const detectionRateSynthetic = syntheticResults.length > 0
    ? syntheticDetections / syntheticResults.length
    : 0;
  
  const detectionRateWildchat = wildchatResults.length > 0
    ? wildchatDetections / wildchatResults.length
    : 0;
  
  // Domain breakdown
  const domainBreakdown = new Map<string, {
    synthetic: { count: number; avg_score: number; scores: number[] };
    wildchat: { count: number; avg_score: number; scores: number[] };
  }>();
  
  syntheticResults.forEach(r => {
    const domain = r.domain || 'unknown';
    if (!domainBreakdown.has(domain)) {
      domainBreakdown.set(domain, {
        synthetic: { count: 0, avg_score: 0, scores: [] },
        wildchat: { count: 0, avg_score: 0, scores: [] }
      });
    }
    const stats = domainBreakdown.get(domain)!;
    stats.synthetic.count++;
    stats.synthetic.scores.push(r.score);
  });
  
  wildchatResults.forEach(r => {
    const domain = r.domain || 'unknown';
    if (!domainBreakdown.has(domain)) {
      domainBreakdown.set(domain, {
        synthetic: { count: 0, avg_score: 0, scores: [] },
        wildchat: { count: 0, avg_score: 0, scores: [] }
      });
    }
    const stats = domainBreakdown.get(domain)!;
    stats.wildchat.count++;
    stats.wildchat.scores.push(r.score);
  });
  
  // Calculate averages
  domainBreakdown.forEach((stats, domain) => {
    if (stats.synthetic.scores.length > 0) {
      stats.synthetic.avg_score = stats.synthetic.scores.reduce((sum, s) => sum + s, 0) / stats.synthetic.scores.length;
    }
    if (stats.wildchat.scores.length > 0) {
      stats.wildchat.avg_score = stats.wildchat.scores.reduce((sum, s) => sum + s, 0) / stats.wildchat.scores.length;
    }
  });
  
  // Convert to final format
  const finalBreakdown = new Map<string, {
    synthetic: { count: number; avg_score: number };
    wildchat: { count: number; avg_score: number };
  }>();
  
  domainBreakdown.forEach((stats, domain) => {
    finalBreakdown.set(domain, {
      synthetic: { count: stats.synthetic.count, avg_score: stats.synthetic.avg_score },
      wildchat: { count: stats.wildchat.count, avg_score: stats.wildchat.avg_score }
    });
  });
  
  return {
    synthetic_count: syntheticResults.length,
    wildchat_count: wildchatResults.length,
    synthetic_avg_score: syntheticAvg,
    wildchat_avg_score: wildchatAvg,
    score_difference: wildchatAvg - syntheticAvg,
    detection_rate_synthetic: detectionRateSynthetic,
    detection_rate_wildchat: detectionRateWildchat,
    domain_breakdown: finalBreakdown
  };
}

/**
 * Export WildChat conversations to our database format
 */
export async function importWildChatToDatabase(
  conversations: WildChatConversation[],
  apiEndpoint: string = '/api/conversations'
): Promise<{ imported: number; failed: number }> {
  let imported = 0;
  let failed = 0;
  
  for (const wildChat of conversations) {
    try {
      const conversation = convertWildChatToConversation(wildChat);
      
      // Import via API (would need to match your import endpoint format)
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(conversation)
      });
      
      if (response.ok) {
        imported++;
      } else {
        failed++;
      }
    } catch (error) {
      console.error(`Failed to import conversation ${wildChat.conversation_id}:`, error);
      failed++;
    }
  }
  
  return { imported, failed };
}

