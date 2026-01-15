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
        lines = f.readlines()

    result = []
    i = 0

    while i < len(lines):
        line = lines[i]
        result.append(line)

        # Look for variable assignments with observationService.submit
        # Patterns: const observationId =, const obsId1 =, const obs2Id =, etc
        if re.match(r'\s*(const|let|var)\s+(\w*[Oo]bs\w*[Ii]d\w*)\s*=\s*await observationService\.submit\(', line):
            # Extract variable name
            var_match = re.match(r'\s*(const|let|var)\s+(\w+)', line)
            var_name = var_match.group(2) if var_match else 'observationId'

            # Find end of submit call
            i += 1
            while i < len(lines) and ');' not in lines[i-1]:
                result.append(lines[i])
                i += 1

            # Check if derivation already exists in next few lines
            has_derivation = False
            for j in range(i, min(i + 10, len(lines))):
                if 'deriveFromObservation' in lines[j]:
                    has_derivation = True
                    break

            if not has_derivation:
                # Add blank line and derivation code
                result.append('\n')
                result.append('      // Derive violations (as done by API)\n')
                result.append(f'      const obs = await observationService.getById({var_name});\n')
                result.append('      if (obs && obs.parkingPositionId) {\n')
                result.append('        const position = await parkingPositionService.getById(obs.parkingPositionId);\n')
                result.append("        await violationService.deriveFromObservation(obs, position, 'test-user');\n")
                result.append('      }\n')

            continue

        i += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        f.writelines(result)

    print(f"Completed {filename}")

print("All files processed!")
