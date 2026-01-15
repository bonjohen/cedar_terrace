#!/usr/bin/env python3
import re
import os

test_dir = 'src/test'

# Map of vehicleId references to license plate and state
vehicle_map = {
    'context.vehicleIds.abc123': ("licensePlate: 'ABC123',\n        issuingState: 'CA',", 'ABC123'),
    'context.vehicleIds.xyz789': ("licensePlate: 'XYZ789',\n        issuingState: 'WA',", 'XYZ789'),
    'context.vehicleIds.def456': ("licensePlate: 'DEF456',\n        issuingState: 'OR',", 'DEF456'),
}

for filename in os.listdir(test_dir):
    if filename.endswith('.integration.test.ts'):
        filepath = os.path.join(test_dir, filename)

        with open(filepath, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace vehicleId: context.vehicleIds.XXX with licensePlate and issuingState
        for vehicle_ref, (replacement, plate) in vehicle_map.items():
            content = re.sub(
                rf'vehicleId: {re.escape(vehicle_ref)},',
                replacement,
                content
            )

        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)

print("Fixed all test files")
