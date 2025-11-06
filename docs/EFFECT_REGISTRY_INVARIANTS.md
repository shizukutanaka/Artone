# Effect Registry Domain Model Invariants

## Overview

This document defines the invariants that govern the effect registry domain model. These invariants ensure effects remain in a consistent, performant state throughout their lifecycle and prevent rendering issues or performance degradation.

## Core Domain Invariants

### Identity Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `ID_MIN_LENGTH` | 1 | Minimum ID length | Ensures non-empty identifiers |
| `ID_MAX_LENGTH` | 100 | Maximum ID length | Prevents excessively long IDs |
| `ID_PATTERN` | `/^[a-zA-Z0-9_-]+$/` | Allowed ID characters | Ensures URL-safe, filesystem-safe identifiers |

### Type System Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `SUPPORTED_TYPES` | `['color', 'transform', 'filter', 'transition', 'audio', 'text']` | Supported effect types | Ensures type safety and compatibility |
| `PARAMETER_TYPES` | `['number', 'string', 'boolean', 'color', 'range', 'select', 'file']` | Supported parameter types | Defines valid parameter configurations |

### Performance Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `MAX_EFFECTS_PER_CLIP` | 10 | Maximum effects per clip | Prevents performance degradation |
| `MAX_PARAMETERS_PER_EFFECT` | 20 | Maximum parameters per effect | Maintains reasonable memory usage |
| `MAX_TOTAL_EFFECT_COMPLEXITY` | 100 | Maximum total complexity score | Ensures rendering performance |
| `MAX_PARAMETER_NAME_LENGTH` | 50 | Maximum parameter name length | Prevents UI overflow |
| `MAX_PARAMETER_VALUE_LENGTH` | 1000 | Maximum parameter value length | Prevents memory waste |

### Timing Invariants

| Invariant | Value | Description | Rationale |
|-----------|-------|-------------|-----------|
| `MIN_DURATION` | 0.001s (1ms) | Minimum effect duration | Prevents zero-length effects |
| `MAX_DURATION` | 3600s (1h) | Maximum effect duration | Prevents memory issues |
| `DEFAULT_FADE_DURATION` | 0.5s | Default fade duration | Provides smooth transitions |

**Mathematical Properties:**
- `∀effect: effect.timing.start ∈ [0, 1]`
- `∀effect: effect.timing.duration ∈ (0, 1]`
- `∀effect: effect.timing.start + effect.timing.duration ≤ 1`
- `∀effect: effect.timing.fadeIn ≥ 0 ∧ effect.timing.fadeIn ≤ effect.timing.duration`
- `∀effect: effect.timing.fadeOut ≥ 0 ∧ effect.timing.fadeOut ≤ effect.timing.duration`

## Effect Definition Invariants

### Structure Invariants

**Required Properties:**
- `id: string` - Unique identifier following `ID_PATTERN`
- `name: string` - Human-readable name (1-200 characters)
- `type: string` - Must be in `SUPPORTED_TYPES`
- `category: string` - Grouping category
- `description: string` - Effect description
- `parameters: EffectParameter[]` - Parameter definitions
- `canAnimate: boolean` - Animation capability flag
- `supportedClipTypes: string[]` - Compatible clip types
- `complexity: number` - Performance complexity score (0-100)

**Parameter Definition Invariants:**
```typescript
interface EffectParameter {
  name: string;           // 1-50 characters
  type: ParameterType;    // Must be in PARAMETER_TYPES
  value: any;            // Current value
  defaultValue: any;     // Default value (same type as value)
  min?: number;          // For numeric types
  max?: number;          // For numeric types
  step?: number;         // For range types
  options?: string[];    // For select types
  unit?: string;         // Display unit (e.g., 'px', '%')
  description?: string;  // Parameter description
}
```

### Validation Invariants

**Parameter Type Validation:**

| Type | Validation Rules | Coercion |
|------|------------------|----------|
| `number` | `isFinite(value)` ∧ `min ≤ value ≤ max` | `Number(value)` |
| `string` | `length ≤ MAX_PARAMETER_VALUE_LENGTH` | `String(value)` |
| `boolean` | N/A | `Boolean(value)` |
| `color` | Valid hex color `#RRGGBB` | None |
| `range` | Like number + step validation | `Number(value)` |
| `select` | `value ∈ options` | None |
| `file` | Non-empty string | None |

## Effect Instance Invariants

### Instance Structure Invariants

**Required Properties:**
- `id: string` - Unique instance identifier
- `definitionId: string` - Reference to effect definition
- `clipId: string` - Parent clip identifier
- `parameters: Record<string, any>` - Parameter values
- `timing: EffectTiming` - Timing configuration
- `enabled: boolean` - Enable/disable flag
- `order: number` - Rendering order (≥ 0)

### Timing Invariants

**Timing Object Structure:**
```typescript
interface EffectTiming {
  start: number;     // Relative start (0-1)
  duration: number;  // Relative duration (0-1)
  fadeIn?: number;   // Fade in duration (seconds)
  fadeOut?: number;  // Fade out duration (seconds)
}
```

**Timing Validation Rules:**
1. `start ∈ [0, 1]`
2. `duration ∈ (0, 1]`
3. `start + duration ≤ 1`
4. `fadeIn ≥ 0 ∧ fadeIn ≤ duration` (if defined)
5. `fadeOut ≥ 0 ∧ fadeOut ≤ duration` (if defined)

### Compatibility Invariants

**Clip Type Compatibility Matrix:**

| Effect Type | Compatible Clip Types |
|-------------|----------------------|
| `color` | `video`, `image` |
| `transform` | `video`, `image`, `text` |
| `filter` | `video`, `image` |
| `transition` | `video`, `image` |
| `audio` | `audio` |
| `text` | `text` |

**Conflict Rules:**
- Multiple `color` effects on same clip = conflict
- Multiple `transform` effects on same clip = conflict
- Multiple `filter` effects on same clip = conflict
- Multiple `audio` effects on same clip = conflict

## Operational Invariants

### Creation Invariants

**Pre-conditions:**
- `definitionId` exists in registry
- Clip compatibility verified
- Parameter validation passes

**Post-conditions:**
- New instance has unique ID
- Default parameters applied
- Default timing applied
- `enabled = true`
- `order` set appropriately

**Error Handling:**
- Invalid definition ID throws `EffectDefinitionNotFoundError`
- Incompatible clip throws `EffectIncompatibleError`
- Invalid parameters throw `ParameterValidationError`

### Rendering Invariants

**Progress Calculation:**
```
progress(t) = clamp((t - effectStart) / effectDuration, 0, 1)
```

**Fade Multiplier Calculation:**
```
fadeMultiplier(t) = {
  (t - effectStart) / fadeInDuration    if t < fadeInEnd
  (effectEnd - t) / fadeOutDuration     if t > fadeOutStart
  1                                     otherwise
}
```

**Rendering Pipeline Invariants:**
1. Effects processed in order
2. Disabled effects skipped
3. Invalid effects logged but don't crash pipeline
4. Complexity limits enforced
5. Parameter interpolation within bounds

## Performance Invariants

### Complexity Scoring

**Effect Complexity Calculation:**
```
complexity = baseComplexity + parameterComplexity + animationComplexity
```

Where:
- `baseComplexity` = effect type base score
- `parameterComplexity` = number of parameters × 2
- `animationComplexity` = animation enabled ? 10 : 0

**Clip Complexity Limits:**
- `MAX_EFFECTS_PER_CLIP` = 10 effects
- `MAX_TOTAL_EFFECT_COMPLEXITY` = 100 points

### Rendering Performance

**Frame Budget Invariants:**
- Effect parameter validation: < 1ms
- Effect compatibility check: < 0.5ms
- Progress calculation: < 0.1ms per effect
- Parameter interpolation: < 0.5ms per animated parameter

**Memory Invariants:**
- Effect instances: < 10KB per instance
- Parameter storage: < 5KB per effect
- Registry storage: < 100KB total

## Error Handling Invariants

### Domain Errors

| Error Type | Code | Description | Recovery Action |
|------------|------|-------------|----------------|
| `EffectDefinitionNotFound` | 2001 | Definition not in registry | Check registry state |
| `EffectIncompatible` | 2002 | Effect cannot be applied to clip | Select compatible effect |
| `ParameterValidationError` | 2003 | Invalid parameter value | Use default or coerce value |
| `TimingValidationError` | 2004 | Invalid timing configuration | Clamp to valid range |
| `ComplexityExceeded` | 2005 | Effect complexity too high | Remove or simplify effects |

### Error Propagation

**Rules:**
1. Domain errors thrown immediately for invalid operations
2. Validation errors collected and returned for batch operations
3. Rendering errors logged but don't prevent other effects from rendering
4. Registry errors prevent effect registration but don't crash system

## Testing Invariants

### Unit Test Coverage

Each invariant must have corresponding unit tests:

```typescript
describe('Effect Identity Invariants', () => {
  test('ID_MIN_LENGTH prevents empty effect IDs', () => {
    const result = EffectIdentity.validateId('');
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('ID must be at least 1 characters');
  });

  test('SUPPORTED_TYPES restricts effect types', () => {
    const invalidEffect = { type: 'invalid' };
    expect(() => registerEffect(invalidEffect)).toThrow();
  });
});
```

### Integration Test Coverage

Effect operations must be tested end-to-end:

```typescript
describe('Effect Domain Integration', () => {
  test('create -> validate -> apply -> render cycle maintains invariants', () => {
    const domain = getEffectRegistryDomainModel();

    // Create effect
    const definition = createTestEffectDefinition();
    domain.registerEffect(definition);

    // Create instance
    const instance = domain.createEffectInstance(definition.id, 'clip-1');

    // Validate
    const validation = domain.validateEffectInstance(instance);
    expect(validation.valid).toBe(true);

    // Apply to clip
    const result = domain.applyEffectToClip(definition.id, testClip);
    expect(result.success).toBe(true);

    // Render
    const rendered = domain.renderEffectStack([result.instance!], 0, 0, 10);
    expect(rendered.length).toBe(1);
  });
});
```

### Performance Test Coverage

```typescript
describe('Effect Performance Invariants', () => {
  test('parameter validation completes within time budget', () => {
    const definition = createComplexEffectDefinition();
    const params = generateRandomParameters(definition);

    const start = performance.now();
    const result = EffectParameters.validateParameters(definition, params);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(1); // 1ms budget
    expect(result.valid).toBeDefined();
  });

  test('complexity limits prevent performance degradation', () => {
    const effects = Array.from({ length: 15 }, () => createComplexEffectInstance());

    const start = performance.now();
    const validation = EffectCompatibility.validateComplexity(effects);
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(5); // 5ms budget
    expect(validation.valid).toBe(false); // Should exceed limits
  });
});
```

## Future Extensions

### Planned Invariants

1. **Advanced Animation Invariants**
   - Keyframe density limits
   - Interpolation method constraints
   - Animation curve complexity

2. **Cross-Effect Invariants**
   - Effect interaction rules
   - Rendering order dependencies
   - Resource sharing constraints

3. **Real-time Invariants**
   - Live preview performance
   - Parameter update latency
   - Effect switching time

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
