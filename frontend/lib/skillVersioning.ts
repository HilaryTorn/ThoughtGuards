import { SkillVersion } from '../types';

/**
 * Skill versioning system for tracking skill evolution.
 * Implements semantic versioning (major.minor.patch) and stores skill definitions in database.
 */

/**
 * Parse semantic version string (e.g., "1.2.3")
 */
export function parseVersion(version: string): { major: number; minor: number; patch: number } | null {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10)
  };
}

/**
 * Compare two semantic versions
 * Returns: -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  const parsed1 = parseVersion(v1);
  const parsed2 = parseVersion(v2);

  if (!parsed1 || !parsed2) {
    throw new Error(`Invalid version format: ${v1} or ${v2}`);
  }

  if (parsed1.major !== parsed2.major) {
    return parsed1.major > parsed2.major ? 1 : -1;
  }
  if (parsed1.minor !== parsed2.minor) {
    return parsed1.minor > parsed2.minor ? 1 : -1;
  }
  if (parsed1.patch !== parsed2.patch) {
    return parsed1.patch > parsed2.patch ? 1 : -1;
  }
  return 0;
}

/**
 * Increment version (major, minor, or patch)
 */
export function incrementVersion(
  currentVersion: string,
  level: 'major' | 'minor' | 'patch'
): string {
  const parsed = parseVersion(currentVersion);
  if (!parsed) {
    throw new Error(`Invalid version format: ${currentVersion}`);
  }

  switch (level) {
    case 'major':
      return `${parsed.major + 1}.0.0`;
    case 'minor':
      return `${parsed.major}.${parsed.minor + 1}.0`;
    case 'patch':
      return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
  }
}

/**
 * Validate semantic version format
 */
export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null;
}

/**
 * Get latest version from array of versions
 */
export function getLatestVersion(versions: string[]): string | null {
  if (versions.length === 0) {
    return null;
  }

  let latest = versions[0];
  for (const version of versions.slice(1)) {
    if (compareVersions(version, latest) > 0) {
      latest = version;
    }
  }
  return latest;
}

/**
 * Store skill version in database
 */
export async function storeSkillVersion(
  db: any, // D1Database
  skillVersion: SkillVersion
): Promise<void> {
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO skill_versions (
      skill_id, version, skill_definition, changelog, created_at, created_by, is_active
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  await stmt.bind(
    skillVersion.skill_id,
    skillVersion.version,
    JSON.stringify(skillVersion.skill_definition),
    skillVersion.changelog || null,
    skillVersion.created_at,
    skillVersion.created_by || null,
    skillVersion.is_active ? 1 : 0
  ).run();
}

/**
 * Get skill version from database
 */
export async function getSkillVersion(
  db: any, // D1Database
  skillId: string,
  version: string
): Promise<SkillVersion | null> {
  const stmt = db.prepare(`
    SELECT * FROM skill_versions
    WHERE skill_id = ? AND version = ?
  `);

  const result = await stmt.bind(skillId, version).first();
  if (!result) {
    return null;
  }

  return {
    skill_id: result.skill_id,
    version: result.version,
    skill_definition: JSON.parse(result.skill_definition),
    changelog: result.changelog || undefined,
    created_at: result.created_at,
    created_by: result.created_by || undefined,
    is_active: result.is_active === 1
  };
}

/**
 * Get all versions for a skill
 */
export async function getSkillVersions(
  db: any, // D1Database
  skillId: string
): Promise<SkillVersion[]> {
  const stmt = db.prepare(`
    SELECT * FROM skill_versions
    WHERE skill_id = ?
    ORDER BY created_at DESC
  `);

  const results = await stmt.bind(skillId).all();
  return results.results.map((row: any) => ({
    skill_id: row.skill_id,
    version: row.version,
    skill_definition: JSON.parse(row.skill_definition),
    changelog: row.changelog || undefined,
    created_at: row.created_at,
    created_by: row.created_by || undefined,
    is_active: row.is_active === 1
  }));
}

/**
 * Get active version for a skill
 */
export async function getActiveSkillVersion(
  db: any, // D1Database
  skillId: string
): Promise<SkillVersion | null> {
  const stmt = db.prepare(`
    SELECT * FROM skill_versions
    WHERE skill_id = ? AND is_active = 1
    ORDER BY created_at DESC
    LIMIT 1
  `);

  const result = await stmt.bind(skillId).first();
  if (!result) {
    return null;
  }

  return {
    skill_id: result.skill_id,
    version: result.version,
    skill_definition: JSON.parse(result.skill_definition),
    changelog: result.changelog || undefined,
    created_at: result.created_at,
    created_by: result.created_by || undefined,
    is_active: result.is_active === 1
  };
}

/**
 * Deactivate old versions when a new version is set as active
 */
export async function deactivateOtherVersions(
  db: any, // D1Database
  skillId: string,
  activeVersion: string
): Promise<void> {
  const stmt = db.prepare(`
    UPDATE skill_versions
    SET is_active = 0
    WHERE skill_id = ? AND version != ?
  `);

  await stmt.bind(skillId, activeVersion).run();
}

/**
 * Create a new skill version
 */
export async function createSkillVersion(
  db: any, // D1Database
  skillId: string,
  skillDefinition: Record<string, any>,
  changelog?: string,
  createdBy?: string
): Promise<SkillVersion> {
  // Get latest version to increment
  const existingVersions = await getSkillVersions(db, skillId);
  const latestVersion = existingVersions.length > 0
    ? getLatestVersion(existingVersions.map(v => v.version))
    : null;

  // Determine new version (default to 1.0.0 if no existing versions)
  const newVersion = latestVersion
    ? incrementVersion(latestVersion, 'patch') // Default to patch increment
    : '1.0.0';

  const skillVersion: SkillVersion = {
    skill_id: skillId,
    version: newVersion,
    skill_definition: skillDefinition,
    changelog,
    created_at: new Date().toISOString(),
    created_by: createdBy,
    is_active: true
  };

  // Deactivate other versions
  await deactivateOtherVersions(db, skillId, newVersion);

  // Store new version
  await storeSkillVersion(db, skillVersion);

  return skillVersion;
}

