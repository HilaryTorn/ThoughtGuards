import { Conversation } from '../types';

/**
 * Prompt patching: Store prompt patches in database, apply before execution,
 * track patch usage, support versioning.
 */

export interface PromptPatch {
  patch_id: string;
  patch_name: string;
  patch_version: string;
  target_skill_id: string;
  target_prompt_version?: string; // If null, applies to all versions
  patch_type: 'prepend' | 'append' | 'replace' | 'regex_replace' | 'custom';
  patch_content: string;
  patch_config?: {
    position?: number; // For prepend/append
    search_pattern?: string; // For replace/regex_replace
    replacement?: string;
    regex_flags?: string;
  };
  created_at: string;
  created_by?: string;
  is_active: boolean;
  usage_count: number;
  last_used_at?: string;
}

/**
 * Apply prompt patch to conversation
 */
export function applyPromptPatch(
  conversation: Conversation,
  patch: PromptPatch,
  skillPrompt?: string // Original skill prompt if available
): {
  patched_conversation: Conversation;
  patch_applied: boolean;
} {
  let patchedConversation = { ...conversation };
  let patchApplied = false;
  
  switch (patch.patch_type) {
    case 'prepend':
      // Prepend patch content to first turn
      if (conversation.turns.length > 0) {
        patchedConversation = {
          ...conversation,
          turns: [
            {
              ...conversation.turns[0],
              content: `${patch.patch_content}\n\n${conversation.turns[0].content}`
            },
            ...conversation.turns.slice(1)
          ]
        };
        patchApplied = true;
      }
      break;
      
    case 'append':
      // Append patch content to last turn
      if (conversation.turns.length > 0) {
        const lastIndex = conversation.turns.length - 1;
        patchedConversation = {
          ...conversation,
          turns: [
            ...conversation.turns.slice(0, lastIndex),
            {
              ...conversation.turns[lastIndex],
              content: `${conversation.turns[lastIndex].content}\n\n${patch.patch_content}`
            }
          ]
        };
        patchApplied = true;
      }
      break;
      
    case 'replace':
      // Simple string replacement
      if (patch.patch_config?.search_pattern && patch.patch_config?.replacement) {
        patchedConversation = {
          ...conversation,
          turns: conversation.turns.map(turn => ({
            ...turn,
            content: turn.content.replace(
              patch.patch_config!.search_pattern!,
              patch.patch_config!.replacement!
            )
          }))
        };
        patchApplied = true;
      }
      break;
      
    case 'regex_replace':
      // Regex replacement
      if (patch.patch_config?.search_pattern && patch.patch_config?.replacement) {
        const flags = patch.patch_config.regex_flags || 'g';
        const regex = new RegExp(patch.patch_config.search_pattern, flags);
        
        patchedConversation = {
          ...conversation,
          turns: conversation.turns.map(turn => ({
            ...turn,
            content: turn.content.replace(regex, patch.patch_config!.replacement!)
          }))
        };
        patchApplied = true;
      }
      break;
      
    case 'custom':
      // Custom patch logic (would need custom function)
      // For now, just prepend
      if (conversation.turns.length > 0) {
        patchedConversation = {
          ...conversation,
          turns: [
            {
              ...conversation.turns[0],
              content: `${patch.patch_content}\n\n${conversation.turns[0].content}`
            },
            ...conversation.turns.slice(1)
          ]
        };
        patchApplied = true;
      }
      break;
  }
  
  return {
    patched_conversation: patchedConversation,
    patch_applied: patchApplied
  };
}

/**
 * Store prompt patch in database
 */
export async function storePromptPatch(
  db: any, // D1Database
  patch: PromptPatch
): Promise<void> {
  try {
    // Note: This assumes a prompt_patches table exists
    // In production, would need to create this table or use existing schema
    const stmt = db.prepare(`
      INSERT OR REPLACE INTO prompt_patches (
        patch_id, patch_name, patch_version, target_skill_id,
        target_prompt_version, patch_type, patch_content,
        patch_config, created_at, created_by, is_active,
        usage_count, last_used_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    await stmt.bind(
      patch.patch_id,
      patch.patch_name,
      patch.patch_version,
      patch.target_skill_id,
      patch.target_prompt_version || null,
      patch.patch_type,
      patch.patch_content,
      patch.patch_config ? JSON.stringify(patch.patch_config) : null,
      patch.created_at,
      patch.created_by || null,
      patch.is_active ? 1 : 0,
      patch.usage_count,
      patch.last_used_at || null
    ).run();
  } catch (error) {
    console.error('Error storing prompt patch:', error);
    // If table doesn't exist, log warning
    if ((error as any).message?.includes('no such table')) {
      console.warn('prompt_patches table does not exist. Run schema migration.');
    }
    throw error;
  }
}

/**
 * Get active patches for a skill
 */
export async function getActivePatches(
  db: any, // D1Database
  skillId: string,
  promptVersion?: string
): Promise<PromptPatch[]> {
  try {
    let query = `
      SELECT * FROM prompt_patches
      WHERE target_skill_id = ? AND is_active = 1
    `;
    
    const params: any[] = [skillId];
    
    if (promptVersion) {
      query += ' AND (target_prompt_version IS NULL OR target_prompt_version = ?)';
      params.push(promptVersion);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const stmt = db.prepare(query);
    const results = await stmt.bind(...params).all();
    
    return results.results.map((row: any) => ({
      patch_id: row.patch_id,
      patch_name: row.patch_name,
      patch_version: row.patch_version,
      target_skill_id: row.target_skill_id,
      target_prompt_version: row.target_prompt_version || undefined,
      patch_type: row.patch_type as PromptPatch['patch_type'],
      patch_content: row.patch_content,
      patch_config: row.patch_config ? JSON.parse(row.patch_config) : undefined,
      created_at: row.created_at,
      created_by: row.created_by || undefined,
      is_active: row.is_active === 1,
      usage_count: row.usage_count || 0,
      last_used_at: row.last_used_at || undefined
    }));
  } catch (error) {
    console.error('Error fetching prompt patches:', error);
    return [];
  }
}

/**
 * Apply all active patches to conversation
 */
export async function applyAllPatches(
  conversation: Conversation,
  skillId: string,
  promptVersion: string | undefined,
  db?: any
): Promise<{
  patched_conversation: Conversation;
  applied_patches: PromptPatch[];
}> {
  let patchedConversation = conversation;
  const appliedPatches: PromptPatch[] = [];
  
  if (!db) {
    return {
      patched_conversation: conversation,
      applied_patches: []
    };
  }
  
  const patches = await getActivePatches(db, skillId, promptVersion);
  
  // Apply patches in order (oldest first)
  for (const patch of patches) {
    const result = applyPromptPatch(patchedConversation, patch);
    patchedConversation = result.patched_conversation;
    if (result.patch_applied) {
      appliedPatches.push(patch);
      
      // Update usage count
      await updatePatchUsage(db, patch.patch_id);
    }
  }
  
  return {
    patched_conversation: patchedConversation,
    applied_patches: appliedPatches
  };
}

/**
 * Update patch usage statistics
 */
async function updatePatchUsage(
  db: any, // D1Database
  patchId: string
): Promise<void> {
  try {
    const stmt = db.prepare(`
      UPDATE prompt_patches
      SET usage_count = usage_count + 1,
          last_used_at = ?
      WHERE patch_id = ?
    `);
    
    await stmt.bind(new Date().toISOString(), patchId).run();
  } catch (error) {
    console.error('Error updating patch usage:', error);
    // Don't throw - usage tracking is best effort
  }
}

/**
 * Create prompt patch
 */
export function createPromptPatch(
  patchName: string,
  skillId: string,
  patchType: PromptPatch['patch_type'],
  patchContent: string,
  patchConfig?: PromptPatch['patch_config'],
  promptVersion?: string,
  createdBy?: string
): PromptPatch {
  const patchId = `patch-${skillId}-${Date.now()}`;
  const patchVersion = '1.0.0'; // Start at 1.0.0
  
  return {
    patch_id: patchId,
    patch_name: patchName,
    patch_version: patchVersion,
    target_skill_id: skillId,
    target_prompt_version: promptVersion,
    patch_type: patchType,
    patch_content: patchContent,
    patch_config: patchConfig,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    is_active: true,
    usage_count: 0
  };
}

/**
 * Version prompt patch
 * Create new version of existing patch
 */
export function versionPromptPatch(
  existingPatch: PromptPatch,
  newContent?: string,
  newConfig?: PromptPatch['patch_config']
): PromptPatch {
  // Increment version (simplified semantic versioning)
  const versionParts = existingPatch.patch_version.split('.');
  const minor = parseInt(versionParts[1] || '0') + 1;
  const newVersion = `${versionParts[0]}.${minor}.0`;
  
  return {
    ...existingPatch,
    patch_version: newVersion,
    patch_content: newContent || existingPatch.patch_content,
    patch_config: newConfig || existingPatch.patch_config,
    created_at: new Date().toISOString(),
    usage_count: 0 // Reset usage for new version
  };
}

