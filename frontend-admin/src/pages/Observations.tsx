import React, { useState, useEffect } from 'react';
import { observationsApi, storageApi, parkingPositionsApi } from '../api/client';
import { useAppStore } from '../store/app-store';

interface Position {
  id: string;
  identifier: string;
  type: string;
}

interface EvidenceItem {
  type: 'PHOTO' | 'TEXT_NOTE';
  photoUrl?: string;
  photoS3Key?: string;
  photoIntent?: string;
  textContent?: string;
}

const PHOTO_INTENTS = [
  { value: 'PRIMARY_VEHICLE_VIEW', label: 'Primary Vehicle View' },
  { value: 'SECONDARY_VEHICLE_VIEW', label: 'Secondary Vehicle View' },
  { value: 'LICENSE_PLATE', label: 'License Plate' },
  { value: 'REGISTRATION_STICKER', label: 'Registration Sticker' },
  { value: 'HANDICAPPED_PLACARD', label: 'Handicapped Placard' },
  { value: 'GENERAL_CONTEXT', label: 'General Context' },
];

export function Observations() {
  const { currentSiteId, setError } = useAppStore();
  const [step, setStep] = useState<'details' | 'evidence' | 'review'>('details');
  const [submitting, setSubmitting] = useState(false);

  // Form data
  const [licensePlate, setLicensePlate] = useState('');
  const [state, setState] = useState('');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [selectedPositionId, setSelectedPositionId] = useState<string | null>(null);
  const [locationDescription, setLocationDescription] = useState('');

  // Evidence
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [uploading, setUploading] = useState(false);

  // Positions
  const [positions, setPositions] = useState<Position[]>([]);

  useEffect(() => {
    if (currentSiteId) {
      loadPositions();
    }
  }, [currentSiteId]);

  const loadPositions = async () => {
    if (!currentSiteId) return;
    try {
      const data = await parkingPositionsApi.list(currentSiteId);
      setPositions(data);
    } catch (error: any) {
      setError(error.message || 'Failed to load positions');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        // Get upload URL
        const { uploadUrl, s3Key } = await storageApi.getUploadUrl(
          file.name,
          file.type
        );

        // Upload to S3
        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          body: file,
          headers: {
            'Content-Type': file.type,
          },
        });

        if (!uploadResponse.ok) {
          throw new Error('Failed to upload photo');
        }

        // Add to evidence
        setEvidence((prev) => [
          ...prev,
          {
            type: 'PHOTO',
            photoS3Key: s3Key,
            photoUrl: URL.createObjectURL(file),
            photoIntent: 'PRIMARY_VEHICLE_VIEW',
          },
        ]);
      }
    } catch (error: any) {
      setError(error.message || 'Failed to upload photos');
    } finally {
      setUploading(false);
    }
  };

  const addTextNote = () => {
    setEvidence((prev) => [
      ...prev,
      {
        type: 'TEXT_NOTE',
        textContent: '',
      },
    ]);
  };

  const updateEvidence = (index: number, updates: Partial<EvidenceItem>) => {
    setEvidence((prev) =>
      prev.map((item, i) => (i === index ? { ...item, ...updates } : item))
    );
  };

  const removeEvidence = (index: number) => {
    setEvidence((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async () => {
    if (!currentSiteId) {
      setError('Please configure Site ID on Dashboard');
      return;
    }

    if (evidence.length === 0) {
      setError('Please add at least one evidence item');
      return;
    }

    setSubmitting(true);
    try {
      const idempotencyKey = `obs-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      await observationsApi.submit({
        idempotencyKey,
        siteId: currentSiteId,
        vehicle: {
          licensePlate: licensePlate || undefined,
          state: state || undefined,
          make: make || undefined,
          model: model || undefined,
          color: color || undefined,
        },
        parkingPositionId: selectedPositionId || undefined,
        locationDescription: locationDescription || undefined,
        evidence: evidence.map((item) => ({
          type: item.type,
          photoS3Key: item.photoS3Key,
          photoIntent: item.photoIntent,
          textContent: item.textContent,
        })),
      });

      // Reset form
      setLicensePlate('');
      setState('');
      setMake('');
      setModel('');
      setColor('');
      setSelectedPositionId(null);
      setLocationDescription('');
      setEvidence([]);
      setStep('details');
      setError(null);

      alert('Observation submitted successfully!');
    } catch (error: any) {
      setError(error.message || 'Failed to submit observation');
    } finally {
      setSubmitting(false);
    }
  };

  if (!currentSiteId) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
        <p className="text-yellow-800">
          Please configure Site ID on the Dashboard first.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">Submit Observation</h2>
        <p className="text-gray-600">Document a parking enforcement encounter</p>
      </div>

      {/* Progress Steps */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex items-center justify-between">
          <StepIndicator
            label="Vehicle Details"
            active={step === 'details'}
            completed={step !== 'details'}
            onClick={() => setStep('details')}
          />
          <div className="flex-1 h-1 bg-gray-200 mx-2" />
          <StepIndicator
            label="Evidence"
            active={step === 'evidence'}
            completed={step === 'review'}
            onClick={() => setStep('evidence')}
          />
          <div className="flex-1 h-1 bg-gray-200 mx-2" />
          <StepIndicator
            label="Review"
            active={step === 'review'}
            completed={false}
            onClick={() => setStep('review')}
          />
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-lg shadow p-6">
        {step === 'details' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">
              Vehicle Information
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  License Plate
                </label>
                <input
                  type="text"
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="ABC1234"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  State
                </label>
                <input
                  type="text"
                  value={state}
                  onChange={(e) => setState(e.target.value.toUpperCase())}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="CA"
                  maxLength={2}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Make
                </label>
                <input
                  type="text"
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Toyota"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Camry"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Color
                </label>
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Silver"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parking Position (optional)
              </label>
              <select
                value={selectedPositionId || ''}
                onChange={(e) => setSelectedPositionId(e.target.value || null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">No specific position</option>
                {positions.map((pos) => (
                  <option key={pos.id} value={pos.id}>
                    {pos.identifier} ({pos.type})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Location Description (optional)
              </label>
              <textarea
                value={locationDescription}
                onChange={(e) => setLocationDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Additional location context..."
              />
            </div>

            <div className="flex justify-end">
              <button
                onClick={() => setStep('evidence')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700"
              >
                Next: Add Evidence
              </button>
            </div>
          </div>
        )}

        {step === 'evidence' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Evidence</h3>
              <div className="flex space-x-2">
                <label className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer">
                  {uploading ? 'Uploading...' : '+ Add Photos'}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handlePhotoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                </label>
                <button
                  onClick={addTextNote}
                  className="bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700"
                >
                  + Add Note
                </button>
              </div>
            </div>

            {evidence.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="mb-2">No evidence added yet</p>
                <p className="text-sm">Add photos or text notes to document this observation</p>
              </div>
            ) : (
              <div className="space-y-4">
                {evidence.map((item, index) => (
                  <div
                    key={index}
                    className="border border-gray-300 rounded-lg p-4 space-y-3"
                  >
                    {item.type === 'PHOTO' ? (
                      <>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <label className="block text-sm font-medium text-gray-700 mb-1">
                              Photo Intent
                            </label>
                            <select
                              value={item.photoIntent || ''}
                              onChange={(e) =>
                                updateEvidence(index, { photoIntent: e.target.value })
                              }
                              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                              {PHOTO_INTENTS.map((intent) => (
                                <option key={intent.value} value={intent.value}>
                                  {intent.label}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            onClick={() => removeEvidence(index)}
                            className="ml-4 text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                        {item.photoUrl && (
                          <img
                            src={item.photoUrl}
                            alt="Evidence"
                            className="w-full h-48 object-cover rounded-lg"
                          />
                        )}
                      </>
                    ) : (
                      <>
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-medium text-gray-700">Text Note</h4>
                          <button
                            onClick={() => removeEvidence(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            Remove
                          </button>
                        </div>
                        <textarea
                          value={item.textContent || ''}
                          onChange={(e) =>
                            updateEvidence(index, { textContent: e.target.value })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={4}
                          placeholder="Enter observation notes..."
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStep('details')}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400"
              >
                Back
              </button>
              <button
                onClick={() => setStep('review')}
                disabled={evidence.length === 0}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Next: Review
              </button>
            </div>
          </div>
        )}

        {step === 'review' && (
          <div className="space-y-6">
            <h3 className="text-lg font-semibold text-gray-900">Review Observation</h3>

            <div className="space-y-4">
              <div className="border-b pb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Vehicle Information
                </h4>
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {licensePlate && (
                    <>
                      <dt className="text-gray-600">License Plate:</dt>
                      <dd className="font-medium">{licensePlate}</dd>
                    </>
                  )}
                  {state && (
                    <>
                      <dt className="text-gray-600">State:</dt>
                      <dd className="font-medium">{state}</dd>
                    </>
                  )}
                  {make && (
                    <>
                      <dt className="text-gray-600">Make:</dt>
                      <dd className="font-medium">{make}</dd>
                    </>
                  )}
                  {model && (
                    <>
                      <dt className="text-gray-600">Model:</dt>
                      <dd className="font-medium">{model}</dd>
                    </>
                  )}
                  {color && (
                    <>
                      <dt className="text-gray-600">Color:</dt>
                      <dd className="font-medium">{color}</dd>
                    </>
                  )}
                </dl>
              </div>

              <div className="border-b pb-4">
                <h4 className="text-sm font-semibold text-gray-700 mb-3">Location</h4>
                {selectedPositionId ? (
                  <p className="text-sm">
                    Position:{' '}
                    <span className="font-medium">
                      {positions.find((p) => p.id === selectedPositionId)?.identifier}
                    </span>
                  </p>
                ) : (
                  <p className="text-sm text-gray-600">No specific position selected</p>
                )}
                {locationDescription && (
                  <p className="text-sm mt-2">{locationDescription}</p>
                )}
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-700 mb-3">
                  Evidence ({evidence.length} items)
                </h4>
                <ul className="space-y-2 text-sm">
                  {evidence.map((item, index) => (
                    <li key={index} className="flex items-center">
                      {item.type === 'PHOTO' ? (
                        <>
                          <span className="text-blue-600 mr-2">📷</span>
                          <span>
                            Photo - {PHOTO_INTENTS.find((i) => i.value === item.photoIntent)?.label}
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="text-gray-600 mr-2">📝</span>
                          <span>Text Note</span>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="flex justify-between pt-4">
              <button
                onClick={() => setStep('evidence')}
                disabled={submitting}
                className="bg-gray-300 text-gray-700 px-6 py-2 rounded-lg hover:bg-gray-400 disabled:opacity-50"
              >
                Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {submitting ? 'Submitting...' : 'Submit Observation'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StepIndicator({
  label,
  active,
  completed,
  onClick,
}: {
  label: string;
  active: boolean;
  completed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center ${
        active ? 'text-blue-600' : completed ? 'text-green-600' : 'text-gray-400'
      }`}
    >
      <div
        className={`w-10 h-10 rounded-full flex items-center justify-center border-2 ${
          active
            ? 'border-blue-600 bg-blue-50'
            : completed
            ? 'border-green-600 bg-green-50'
            : 'border-gray-300 bg-white'
        }`}
      >
        {completed ? '✓' : active ? '●' : '○'}
      </div>
      <span className="text-xs mt-1 font-medium">{label}</span>
    </button>
  );
}
