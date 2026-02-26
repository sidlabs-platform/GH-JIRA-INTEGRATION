#!/usr/bin/env node

/**
 * Simple tests for the Jira integration script
 * Run with: node test-extraction.js
 */

const { extractJiraKeys, findUserStory, normalizeAlertInput, meetsSeverityThreshold, checkForDuplicate } = require('./create-jira-issues.js');

// Test counter
let passed = 0;
let failed = 0;

function test(description, actual, expected) {
  const isArray = Array.isArray(expected);
  const match = isArray 
    ? JSON.stringify(actual) === JSON.stringify(expected)
    : actual === expected;
    
  if (match) {
    console.log(`✓ ${description}`);
    passed++;
  } else {
    console.log(`✗ ${description}`);
    console.log(`  Expected: ${JSON.stringify(expected)}`);
    console.log(`  Actual:   ${JSON.stringify(actual)}`);
    failed++;
  }
}

console.log('='.repeat(60));
console.log('Testing Jira Key Extraction');
console.log('='.repeat(60));

// Test extractJiraKeys
test(
  'Extract direct Jira key',
  extractJiraKeys('Working on PROJ-123'),
  ['PROJ-123']
);

test(
  'Extract with User Story prefix',
  extractJiraKeys('User Story: AUTH-456'),
  ['AUTH-456']
);

test(
  'Extract with JIRA prefix',
  extractJiraKeys('JIRA: SEC-789'),
  ['SEC-789']
);

test(
  'Extract bracketed format',
  extractJiraKeys('[PROJ-111]'),
  ['PROJ-111']
);

test(
  'Extract multiple keys',
  extractJiraKeys('PROJ-123 and PROJ-456').sort(),
  ['PROJ-123', 'PROJ-456'].sort()
);

test(
  'No match for lowercase',
  extractJiraKeys('proj-123'),
  []
);

test(
  'No match for invalid format',
  extractJiraKeys('PROJ 123'),
  []
);

test(
  'Extract from multiline text',
  extractJiraKeys('Line 1\nUser Story: TEST-999\nLine 3'),
  ['TEST-999']
);

test(
  'Extract multi-hyphen key',
  extractJiraKeys('Working on SUB-PROJ-123'),
  ['SUB-PROJ-123']
);

console.log('\n' + '='.repeat(60));
console.log('Testing User Story Finder');
console.log('='.repeat(60));

// Test findUserStory
test(
  'Find from PR description (priority)',
  findUserStory('User Story: PROJ-123', [
    { commit: { message: 'Different story: PROJ-456' } }
  ]),
  'PROJ-123'
);

test(
  'Find from commit when not in PR',
  findUserStory('No story here', [
    { commit: { message: 'User Story: PROJ-456' } }
  ]),
  'PROJ-456'
);

test(
  'Return null when not found',
  findUserStory('No story', [
    { commit: { message: 'No story either' } }
  ]),
  null
);

test(
  'Find from most recent commit',
  findUserStory('', [
    { commit: { message: 'feat: new feature [AUTH-100]' } },
    { commit: { message: 'fix: bug fix [AUTH-101]' } }
  ]),
  'AUTH-100'
);

console.log('\n' + '='.repeat(60));
console.log('Testing False Positive Exclusion');
console.log('='.repeat(60));

test(
  'Exclude HTTP-200 false positive',
  extractJiraKeys('Response was HTTP-200'),
  []
);

test(
  'Exclude UTF-8 false positive',
  extractJiraKeys('Encoding is UTF-8'),
  []
);

test(
  'Exclude SSL-3 false positive',
  extractJiraKeys('Protocol SSL-3 is deprecated'),
  []
);

test(
  'Do not exclude valid key similar to exclusion',
  extractJiraKeys('Working on HTTPS-123'),
  ['HTTPS-123']
);

console.log('\n' + '='.repeat(60));
console.log('Testing Alert Normalization');
console.log('='.repeat(60));

test(
  'Normalize code scanning alert',
  (() => {
    const result = normalizeAlertInput('code_scanning_alert', {
      number: 42,
      html_url: 'https://github.com/test/repo/security/code-scanning/42',
      rule: { id: 'js/sql-injection', severity: 'error', security_severity_level: 'high', description: 'SQL Injection' },
      most_recent_instance: { location: { path: 'src/db.js' }, commit_sha: 'abc123' },
    });
    return result._type === 'code_scanning' && result.rule.security_severity_level === 'high' && result.number === 42;
  })(),
  true
);

test(
  'Normalize secret scanning alert',
  (() => {
    const result = normalizeAlertInput('secret_scanning_alert', {
      number: 7,
      html_url: 'https://github.com/test/repo/security/secret-scanning/7',
      secret_type: 'github_token',
      secret_type_display_name: 'GitHub Token',
    });
    return result._type === 'secret_scanning' && result.rule.security_severity_level === 'critical' && result.number === 7;
  })(),
  true
);

test(
  'Normalize dependabot alert',
  (() => {
    const result = normalizeAlertInput('dependabot_alert', {
      number: 15,
      html_url: 'https://github.com/test/repo/security/dependabot/15',
      security_advisory: { severity: 'high', summary: 'XSS vulnerability', cve_id: 'CVE-2024-1234' },
      dependency: { package: { name: 'lodash' }, manifest_path: 'package.json' },
    });
    return result._type === 'dependabot' && result.rule.security_severity_level === 'high' && result._packageName === 'lodash';
  })(),
  true
);

test(
  'Return null for unsupported event type',
  normalizeAlertInput('unknown_event', {}),
  null
);

console.log('\n' + '='.repeat(60));
console.log('Testing Severity Threshold Filter');
console.log('='.repeat(60));

test(
  'Critical meets medium threshold',
  meetsSeverityThreshold('critical', 'medium'),
  true
);

test(
  'Low does not meet high threshold',
  meetsSeverityThreshold('low', 'high'),
  false
);

test(
  'Medium meets medium threshold',
  meetsSeverityThreshold('medium', 'medium'),
  true
);

test(
  'High meets low threshold',
  meetsSeverityThreshold('high', 'low'),
  true
);

test(
  'Null severity defaults to 0',
  meetsSeverityThreshold(null, 'low'),
  false
);

console.log('\n' + '='.repeat(60));
console.log('Test Results');
console.log('='.repeat(60));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
