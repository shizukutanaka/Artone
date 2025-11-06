# Clip Domain Model Invariants

## Overview

This document defines the invariants that govern the clip domain model. These invariants ensure clips remain in a consistent, valid state throughout their lifecycle and prevent data corruption or unexpected behavior.

## Core Domain Invariants

### Identity Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `ID_MIN_LENGTH` | 1 | Minimum ID length | Ensures non-empty identifiers |
| `ID_MAX_LENGTH` | 100 | Maximum ID length | Prevents excessively long IDs |
| `ID_PATTERN` | `/^[a-zA-Z0-9_-]+$/` | Allowed ID characters | Ensures URL-safe, filesystem-safe identifiers |

### Temporal Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `MIN_DURATION` | 0.001s (1ms) | Minimum clip duration | Prevents zero-length clips that cause division by zero |
| `MAX_DURATION` | 3600s (1h) | Maximum clip duration | Prevents memory issues with extremely long clips |
| `MIN_START_TIME` | 0s | Minimum start time | Physical impossibility of negative time |

**Mathematical Properties:**
- `∀clip: clip.start ≥ MIN_START_TIME`
- `∀clip: MIN_DURATION ≤ clip.duration ≤ MAX_DURATION`
- `∀clip: clip.end = clip.start + clip.duration > clip.start`

### Content Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `NAME_MIN_LENGTH` | 1 | Minimum name length | Ensures identifiable clips |
| `NAME_MAX_LENGTH` | 200 | Maximum name length | Prevents UI overflow and memory waste |
| `SUPPORTED_TYPES` | `['video', 'audio', 'text', 'image']` | Allowed clip types | Ensures type safety and compatibility |

### Effects Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `MAX_EFFECTS_PER_CLIP` | 50 | Maximum effects per clip | Prevents performance degradation |
| `MAX_EFFECT_PARAMETERS` | 100 | Maximum effect parameters | Maintains reasonable memory usage |

## Operational Invariants

### Creation Invariants

**Pre-conditions:**
- `trackId` exists and is valid
- `type ∈ SUPPORTED_TYPES`
- `start ≥ MIN_START_TIME`
- `duration ∈ [MIN_DURATION, MAX_DURATION]`

**Post-conditions:**
- Generated `id` is unique and follows `ID_PATTERN`
- `name` is non-empty and within length bounds
- All temporal invariants are satisfied

**Error Handling:**
- Invalid parameters throw `DomainError` with specific error codes
- Partial creation states are rolled back

### Transformation Invariants

#### Move Operation
**Pre-conditions:**
- `newStart ≥ MIN_START_TIME`
- Target track exists (if specified)

**Post-conditions:**
- `clip.start = max(MIN_START_TIME, newStart)`
- `clip.trackId` updated if specified
- Duration unchanged
- All other properties preserved

#### Resize Operation
**Pre-conditions:**
- `newDuration ∈ [MIN_DURATION, MAX_DURATION]`

**Post-conditions:**
- `clip.duration = clamp(newDuration, MIN_DURATION, MAX_DURATION)`
- If `fromStart = true`: `clip.start` adjusted to maintain end time
- Temporal ordering preserved: `clip.start + clip.duration > clip.start`

#### Split Operation
**Pre-conditions:**
- `splitTime ∈ (clip.start, clip.start + clip.duration)`

**Post-conditions:**
- Returns two clips: `[leftClip, rightClip]`
- `leftClip.start = clip.start`
- `leftClip.duration = splitTime - clip.start`
- `rightClip.start = splitTime`
- `rightClip.duration = clip.end - splitTime`
- `leftClip.end = rightClip.start`

### Relationship Invariants

#### Track Compatibility
**Pre-conditions:**
- `clip.type ∈ SUPPORTED_TYPES`
- `track.type ∈ SUPPORTED_TYPES`

**Compatibility Matrix:**
```
Video clips: Video tracks only
Audio clips: Audio tracks only
Text clips:  Video or Text tracks
Image clips: Video or Image tracks
```

**Post-conditions:**
- `canPlaceOnTrack(clip, track)` returns boolean
- Invalid combinations return `false`

#### Overlap Detection
**Pre-conditions:**
- Both clips have valid temporal properties

**Post-conditions:**
- `overlaps(clip1, clip2)` is commutative: `overlaps(a,b) ≡ overlaps(b,a)`
- `overlaps(a,b) ∧ overlaps(b,c) ≢ overlaps(a,c)` (transitivity doesn't hold)

**Mathematical Definition:**
```
overlaps(a,b) ⇔ a.start < b.end ∧ b.start < a.end
```

## Validation Invariants

### Single Clip Validation

**Validation Rules:**
1. **Identity**: ID format and length
2. **Temporal**: Start time and duration ranges
3. **Content**: Name presence and type validity
4. **Effects**: Count and parameter limits

**Error Priority:**
- Critical errors: Invalid ID, negative duration
- Warning errors: Unusual values, performance concerns

### Batch Validation

**Pre-conditions:**
- `clips` is array of valid clip objects

**Post-conditions:**
- Returns validation results for each clip
- Maintains clip identity mapping
- Aggregates summary statistics

**Performance Guarantees:**
- Validation time: O(n) where n = clip count
- Memory usage: O(n) for result storage

## Error Handling Invariants

### Domain Errors

| Error Type | Code | Description | Recovery Action |
|------------|------|-------------|----------------|
| `InvalidId` | 1001 | ID validation failed | Generate new ID |
| `InvalidTiming` | 1002 | Temporal invariants violated | Clamp values to valid range |
| `InvalidContent` | 1003 | Content invariants violated | Provide defaults |
| `InvalidRelationship` | 1004 | Relationship invariants violated | Reject operation |
| `TransformationError` | 1005 | Transformation failed | Rollback to previous state |

### Error Propagation

**Rules:**
1. Domain errors are thrown immediately
2. Validation errors are collected and returned
3. Operations maintain atomicity (all-or-nothing)
4. Error messages are user-friendly and actionable

## Performance Invariants

### Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Create | O(1) | ID generation and basic validation |
| Validate | O(1) | Per-clip validation |
| Move | O(1) | Simple property update |
| Resize | O(1) | Duration clamping |
| Split | O(1) | Creates two new objects |
| Find Overlaps | O(n) | Linear search through clips |
| Batch Validate | O(n) | Linear validation |

### Memory Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Create | O(1) | Single clip object |
| Validate | O(1) | Temporary error arrays |
| Transform | O(1) | New object creation |
| Relationships | O(n) | Result arrays |

## Testing Invariants

### Unit Test Coverage

Each invariant must have corresponding unit tests:

```typescript
describe('Clip Identity Invariants', () => {
  test('ID_MIN_LENGTH prevents empty IDs', () => {
    const result = ClipIdentity.validateId('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ID must be at least 1 characters');
  });

  test('ID_PATTERN rejects invalid characters', () => {
    const result = ClipIdentity.validateId('clip@2025');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ID contains invalid characters');
  });
});
```

### Integration Test Coverage

Domain operations must be tested end-to-end:

```typescript
describe('Clip Domain Integration', () => {
  test('create -> validate -> transform cycle maintains invariants', () => {
    const domain = getClipDomainModel();

    // Create clip
    const clip = domain.createClip('track-1', 'video', 0, 5, 'Test');

    // Validate
    const validation = domain.validate(clip);
    expect(validation.valid).toBe(true);

    // Transform
    const moved = domain.move(clip, 10);
    const validation2 = domain.validate(moved);
    expect(validation2.valid).toBe(true);
  });
});
```

### Property-Based Testing

Critical invariants should use property-based tests:

```typescript
describe('Temporal Invariants - Property Tests', () => {
  test('forall clips: end time > start time', () => {
    fc.assert(fc.property(
      fc.record({ start: fc.float(0, 1000), duration: fc.float(0.001, 3600) }),
      (data) => {
        const domain = getClipDomainModel();
        const clip = domain.createClip('track-1', 'video', data.start, data.duration);
        const endTime = domain.getEndTime(clip);
        return endTime > clip.start;
      }
    ));
  });
});
```

## Future Extensions

### Planned Invariants

1. **Multi-track Invariants**
   - Cross-track relationships
   - Track capacity limits
   - Resource sharing constraints

2. **Effect Invariants**
   - Effect compatibility rules
   - Parameter validation schemas
   - Performance impact budgets

3. **Timeline Integration Invariants**
   - Global timeline constraints
   - Cross-clip dependencies
   - Undo/redo consistency

## Maintenance

### Regular Audits

- **Weekly**: Invariant compliance in CI/CD
- **Monthly**: Performance regression testing
- **Quarterly**: Full domain model validation

### Updates Process

1. Propose invariant change with rationale
2. Update domain model and tests
3. Run full test suite
4. Update this document
5. Deploy with feature flags

---

**Last Updated**: 2025-10-13
**Version**: 1.0.0
**Authors**: Artone Development Team
