#!/usr/bin/env node

/**
 * Simple tests for the Jira integration script
 * Run with: node test-extraction.js
 */

const { extractJiraKeys, findUserStory } = require('./create-jira-issues.js');

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
console.log('Test Results');
console.log('='.repeat(60));
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log('='.repeat(60));

process.exit(failed > 0 ? 1 : 0);
