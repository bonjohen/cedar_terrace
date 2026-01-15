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

    # Pattern 1: Change "const observationId = await observationService.submit("
    # to "const result = await observationService.submit(" and add "const observationId = result.observationId;"

    # Find all submit calls and their variable assignments
    # Pattern: const VARNAME = await observationService.submit(
    lines = content.split('\n')
    result_lines = []
    i = 0

    while i < len(lines):
        line = lines[i]

        # Check if this is an observation submit assignment
        match = re.match(r'(\s*)(const|let|var)\s+(\w*[Oo]bs\w*[Ii]d\w*)\s*=\s*await observationService\.submit\(', line)
        if match:
            indent = match.group(1)
            var_type = match.group(2)
            var_name = match.group(3)

            # Replace variable name with 'result'
            new_line = re.sub(
                r'(const|let|var)\s+(\w*[Oo]bs\w*[Ii]d\w*)\s*=',
                f'{var_type} _result_{var_name} =',
                line
            )
            result_lines.append(new_line)

            # Find the end of the submit call
            i += 1
            while i < len(lines) and ');' not in lines[i-1]:
                result_lines.append(lines[i])
                i += 1

            # Add line to extract observationId from result
            result_lines.append(f'{indent}const {var_name} = _result_{var_name}.observationId;\n')

            # Now fix the derivation block that follows
            # It should use the result variable name
            if i < len(lines) and '// Derive violations' in lines[i]:
                result_lines.append(lines[i])  # comment line
                i += 1
                # Next line: const _obs_XXX = await observationService.getById(XXX);
                if i < len(lines):
                    derive_line = lines[i]
                    # Replace the getById call to use the variable name
                    derive_line = re.sub(
                        r'const (_obs_\w+) = await observationService\.getById\((\w+)\);',
                        f'const \\1 = await observationService.getById({var_name});',
                        derive_line
                    )
                    result_lines.append(derive_line)
                    i += 1

                    # Copy the rest of the derivation block (if statement)
                    while i < len(lines) and i < len(lines) and lines[i].strip() and not lines[i].strip().startswith('//') and not lines[i].strip().startswith('expect'):
                        result_lines.append(lines[i])
                        i += 1
                        if 'deriveFromObservation' in lines[i-1]:
                            break
                continue

        result_lines.append(line)
        i += 1

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write('\n'.join(result_lines))

    print(f"Completed {filename}")

print("All files processed!")
