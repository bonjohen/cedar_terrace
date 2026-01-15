#!/usr/bin/env python3
import os
import re

test_dir = 'src/test'

for filename in os.listdir(test_dir):
    if not filename.endswith('.integration.test.ts'):
        continue

    filepath = os.path.join(test_dir, filename)
    print(f"Processing {filename}...")

    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Simple fix: Change pattern from complex derivation to simple inline
    # Find: const result = await observationService.submit(...); [derivation block]
    # Replace with: const result = await observationService.submit(...); const observationId = result.observationId; [simplified derivation]

    # Pattern 1: Fix variable declarations - change back to use .observationId
    content = re.sub(
        r'const result = await observationService\.submit\(',
        'const result = await observationService.submit(',
        content
    )

    # Pattern 2: After submit calls, ensure we extract observationId
    # Add "const observationId = result.observationId;" after any result = submit() call
    lines = content.split('\n')
    new_lines = []
    i = 0

    while i < len(lines):
        new_lines.append(lines[i])

        # Check if this line contains result = await observationService.submit(
        if 'result = await observationService.submit(' in lines[i]:
            # Find end of submit call
            while i < len(lines) - 1 and ');' not in lines[i]:
                i += 1
                new_lines.append(lines[i])

            # Check if next line already extracts observationId
            if i + 1 < len(lines) and 'observationId = result.observationId' not in lines[i+1]:
                # Add extraction line
                # Determine indentation from current line
                indent_match = re.match(r'(\s*)', lines[i])
                indent = indent_match.group(1) if indent_match else '      '
                new_lines.append(f'{indent}const observationId = result.observationId;')

        i += 1

    content = '\n'.join(new_lines)

    # Pattern 3: Fix the derivation blocks to use observationId consistently
    content = re.sub(
        r'const _obs_result = await observationService\.getById\(result\.observationId\);',
        'const _obs = await observationService.getById(observationId);',
        content
    )

    content = re.sub(
        r'if \(_obs_\w+ && _obs_\w+\.parkingPositionId\) \{',
        'if (_obs && _obs.parkingPositionId) {',
        content
    )

    content = re.sub(
        r'const _pos_\w+ = await parkingPositionService\.getById\(_obs_\w+\.parkingPositionId\);',
        'const _pos = await parkingPositionService.getById(_obs.parkingPositionId);',
        content
    )

    content = re.sub(
        r'await violationService\.deriveFromObservation\(_obs_\w+, _pos_\w+,',
        'await violationService.deriveFromObservation(_obs, _pos,',
        content
    )

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Completed {filename}")

print("All files processed!")
