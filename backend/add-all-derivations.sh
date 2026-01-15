#!/bin/bash

# Add violation derivation code after each observationService.submit call
# This mimics what the API does

for file in src/test/*.integration.test.ts; do
  echo "Processing $file..."
  
  # Use a temporary Python script to add derivation calls
  python3 << 'PYTHON_SCRIPT'
import sys
import re

filename = sys.argv[1]

with open(filename, 'r', encoding='utf-8') as f:
    content = f.read()

# Pattern: find each observationService.submit call
# Add derivation code right after the assignment

lines = content.split('\n')
result = []
i = 0

while i < len(lines):
    line = lines[i]
    result.append(line)
    
    # Check if this is a submit call  assignment
    if ('observationId' in line or 'obsId' in line or 'obs1Id' in line or 'obs2Id' in line or 'obs3Id' in line) and 'await observationService.submit(' in line:
        # Find the end of the submit call
        submit_end = i
        while submit_end < len(lines) and ');' not in lines[submit_end]:
            submit_end += 1
            if submit_end < len(lines):
                result.append(lines[submit_end])
        
        # Check if next lines already have derivation
        has_derive = False
        for j in range(submit_end + 1, min(submit_end + 8, len(lines))):
            if 'deriveFromObservation' in lines[j]:
                has_derive = True
                break
        
        if not has_derive:
            # Add derivation code
            # Extract variable name from assignment
            var_match = re.match(r'\s*(const|let|var)\s+(\w+)', line)
            if var_match:
                var_name = var_match.group(2)
                result.append('')
                result.append(f'      // Derive violations (as done by API)')
                result.append(f'      const obs = await observationService.getById({var_name});')
                result.append(f'      if (obs && obs.parkingPositionId) {{')
                result.append(f'        const position = await parkingPositionService.getById(obs.parkingPositionId);')
                result.append(f'        await violationService.deriveFromObservation(obs, position, \'test-user\');')
                result.append(f'      }}')
        
        i = submit_end
    
    i += 1

with open(filename, 'w', encoding='utf-8') as f:
    f.write('\n'.join(result))

print(f"Processed {filename}")
PYTHON_SCRIPT "$file"

done

echo "Done!"
