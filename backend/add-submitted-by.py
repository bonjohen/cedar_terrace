#!/usr/bin/env python3
import re
import os

test_dir = 'src/test'

for filename in os.listdir(test_dir):
    if filename.endswith('.integration.test.ts'):
        filepath = os.path.join(test_dir, filename)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Find all observationService.submit calls and add second parameter
        # Pattern: observationService.submit({ ... })
        # We need to match the closing of the object parameter and add , 'test-user' before the closing )

        # Match submit({ followed by everything until we find }); at the same indentation level
        def add_test_user(match):
            full_match = match.group(0)
            # Check if it already has a second parameter
            if full_match.endswith(", 'test-user');") or full_match.endswith(', "test-user");'):
                return full_match
            # Add second parameter
            return full_match[:-2] + ", 'test-user');"

        # Pattern to match await observationService.submit({...});
        # This is tricky because we need to match balanced braces
        lines = content.split('\n')
        result_lines = []
        i = 0

        while i < len(lines):
            line = lines[i]
            # Check if line contains start of submit call
            if 'await observationService.submit({' in line:
                # Collect lines until we find the closing });
                call_lines = [line]
                brace_count = line.count('{') - line.count('}')
                i += 1

                while i < len(lines) and brace_count > 0:
                    call_lines.append(lines[i])
                    brace_count += lines[i].count('{') - lines[i].count('}')
                    i += 1

                # Now check if the last line ends with }); or }),
                last_line = call_lines[-1]
                if last_line.strip() == '});':
                    # Add second parameter
                    call_lines[-1] = last_line.replace('});', "}, 'test-user');")
                elif last_line.strip() == '}),':
                    call_lines[-1] = last_line.replace('}),', "}, 'test-user'),")

                result_lines.extend(call_lines)
            else:
                result_lines.append(line)
                i += 1

        content = '\n'.join(result_lines)

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print("Fixed all test files")
