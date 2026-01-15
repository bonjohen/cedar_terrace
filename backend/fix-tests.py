#!/usr/bin/env python3
import re
import os

test_dir = 'src/test'

for filename in os.listdir(test_dir):
    if filename.endswith('.integration.test.ts'):
        filepath = os.path.join(test_dir, filename)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Fix observationService.submit calls - add second parameter
        # Match: observationService.submit({ ... })
        # Replace with: observationService.submit({ ... }, 'test-user')
        content = re.sub(
            r'(await observationService\.submit\(\{[^}]+\}\)),',
            r"\1, 'test-user'),",
            content,
            flags=re.DOTALL
        )

        # Handle end of statement cases
        content = re.sub(
            r'(await observationService\.submit\(\{[^}]+\}\));',
            r"\1, 'test-user');",
            content,
            flags=re.DOTALL
        )

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print("Fixed all test files")
