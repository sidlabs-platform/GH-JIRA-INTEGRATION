import { mapSeverityToPriority, getEffectiveSeverity } from '../../src/utils/severity';

describe('mapSeverityToPriority', () => {
  it('maps known severities correctly', () => {
    expect(mapSeverityToPriority('critical')).toBe('Highest');
    expect(mapSeverityToPriority('high')).toBe('High');
    expect(mapSeverityToPriority('medium')).toBe('Medium');
    expect(mapSeverityToPriority('low')).toBe('Low');
    expect(mapSeverityToPriority('note')).toBe('Lowest');
  });

  it('returns Medium for unknown', () => {
    expect(mapSeverityToPriority('extreme')).toBe('Medium');
    expect(mapSeverityToPriority('')).toBe('Medium');
  });
});

describe('getEffectiveSeverity', () => {
  it('prefers security_severity_level', () => {
    const alert = { rule: { security_severity_level: 'high', severity: 'error' } };
    expect(getEffectiveSeverity(alert)).toBe('high');
  });

  it('falls back to severity', () => {
    const alert = { rule: { security_severity_level: '', severity: 'warning' } };
    expect(getEffectiveSeverity(alert)).toBe('warning');
  });

  it('defaults to medium', () => {
    const alert = { rule: {} } as any;
    expect(getEffectiveSeverity(alert)).toBe('medium');
  });
});
