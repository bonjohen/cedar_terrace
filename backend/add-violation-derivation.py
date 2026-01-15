#!/usr/bin/env python3
import re
import os

test_dir = 'src/test'

derivation_code = '''
      // Derive violations (as done by API)
      const obs = await observationService.getById(observationId);
      if (obs && obs.parkingPositionId) {
        const position = await parkingPositionService.getById(obs.parkingPositionId);
        await violationService.deriveFromObservation(obs, position, 'test-user');
      }'''

for filename in os.listdir(test_dir):
    if filename.endswith('.integration.test.ts'):
        filepath = os.path.join(test_dir, filename)

        with open(filepath, 'r', encoding='utf-8') as f:
            lines = f.readlines()

        result_lines = []
        i = 0

        while i < len(lines):
            line = lines[i]
            result_lines.append(line)

            # Look for lines that end with observationService.submit
            if 'await observationService.submit(' in line:
                # Find the end of this statement (could be multiple lines)
                submit_lines = [line]
                i += 1

                while i < len(lines):
                    submit_lines.append(lines[i])
                    if ');' in lines[i]:
                        result_lines.append(lines[i])
                        # Add derivation code after the submit call
                        # Only add if not already present and if we're assigning to observationId
                        if 'observationId' in ''.join(submit_lines):
                            # Check next few lines to see if derivation already exists
                            has_derivation = False
                            for j in range(i+1, min(i+5, len(lines))):
                                if 'deriveFromObservation' in lines[j]:
                                    has_derivation = True
                                    break

                            if not has_derivation:
                                result_lines.append(derivation_code + '\n')
                        break
                    result_lines.append(lines[i])
                    i += 1

            i += 1

        with open(filepath, 'w', encoding='utf-8') as f:
            f.writelines(result_lines)

print("Added violation derivation calls")
