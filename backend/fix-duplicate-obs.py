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

    # Replace all "const obs = await observationService.getById" with unique temporary vars
    # Pattern: find the derivation block and use the observation ID variable name

    def replace_derive_block(match):
        obs_var = match.group(1)  # e.g., "observationId", "obs1Id", etc.
        # Create a unique variable name based on the observation ID variable
        temp_var = f"_obs_{obs_var}"

        return f'''      // Derive violations (as done by API)
      const {temp_var} = await observationService.getById({obs_var});
      if ({temp_var} && {temp_var}.parkingPositionId) {{
        const _pos_{obs_var} = await parkingPositionService.getById({temp_var}.parkingPositionId);
        await violationService.deriveFromObservation({temp_var}, _pos_{obs_var}, 'test-user');
      }}'''

    # Match the derivation blocks
    pattern = r'      // Derive violations \(as done by API\)\n      const obs = await observationService\.getById\((\w+)\);\n      if \(obs && obs\.parkingPositionId\) \{\n        const position = await parkingPositionService\.getById\(obs\.parkingPositionId\);\n        await violationService\.deriveFromObservation\(obs, position, \'test-user\'\);\n      \}'

    content = re.sub(pattern, replace_derive_block, content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

    print(f"Completed {filename}")

print("All files processed!")
