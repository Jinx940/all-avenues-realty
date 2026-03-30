import { useEffect, useState, type CSSProperties, type ChangeEvent, type FormEvent } from 'react';
import { formatAreaServiceLabel } from '../lib/jobLocation';
import { paymentStatusColor, workStatusColor } from '../lib/statusVisuals';
import {
  propertyUnitSpecFields,
  type PropertyStoryFormState,
  type PropertyUnitFormState,
} from '../propertySpecs';
import type {
  JobFile,
  JobRow,
  PropertySummary,
  PropertyStory,
  PropertyUnit,
} from '../types';
import { ProtectedAssetImage, type ProtectedAssetLoadState } from './ProtectedAssetImage';
import { UiIcon, type UiIconName } from './UiIcon';

type PropertyFormBaseState = {
  name: string;
  address: string;
  cityLine: string;
  notes: string;
  coverImageUrl: string;
};

export type PropertyFormFieldName = keyof PropertyFormBaseState;

export type PropertyFormState = PropertyFormBaseState & {
  stories: PropertyStoryFormState[];
};

type SectionTimelineItem = {
  id: string;
  section: string;
  items: Array<{
    id: string;
    area: string;
    service: string;
    before: { file: JobFile; service: string } | null;
    after: { file: JobFile; service: string } | null;
  }>;
};

export function PropertiesView({
  focusMode,
  form,
  properties,
  selectedPropertyId,
  selectedProperty,
  propertyJobs,
  isSaving,
  isUploadingCover,
  isClearingCover,
  editorMode,
  onSubmit,
  onUploadCover,
  onClearCover,
  onDelete,
  onSelect,
  onFieldChange,
  onAddStory,
  onStoryChange,
  onRemoveStory,
  onAddUnit,
  onUnitChange,
  onRemoveUnit,
  onStartCreate,
  onStartEditSelected,
}: {
  focusMode: 'overview' | 'register';
  form: PropertyFormState;
  properties: PropertySummary[];
  selectedPropertyId: string;
  selectedProperty: PropertySummary | null;
  propertyJobs: JobRow[];
  isSaving: boolean;
  isUploadingCover: boolean;
  isClearingCover: boolean;
  editorMode: 'edit' | 'create';
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onUploadCover: (file: File) => void;
  onClearCover: () => void;
  onDelete: (propertyId: string) => void;
  onSelect: (propertyId: string) => void;
  onFieldChange: (field: PropertyFormFieldName, value: string) => void;
  onAddStory: () => void;
  onStoryChange: (
    storyId: string,
    field: keyof PropertyStoryFormState,
    value: string,
  ) => void;
  onRemoveStory: (storyId: string) => void;
  onAddUnit: (storyId: string) => void;
  onUnitChange: (
    storyId: string,
    unitId: string,
    field: keyof PropertyUnitFormState,
    value: string,
  ) => void;
  onRemoveUnit: (storyId: string, unitId: string) => void;
  onStartCreate: () => void;
  onStartEditSelected: () => void;
}) {
  const isRegisterScreen = focusMode === 'register';
  const [isStructureDialogOpen, setIsStructureDialogOpen] = useState(false);
  const [galleryState, setGalleryState] = useState({
    propertyId: '',
    sectionId: '',
    serviceId: '',
    comparePosition: 50,
  });
  const timelineSections = buildSectionTimeline(propertyJobs);
  const activeScopeMatches = galleryState.propertyId === selectedPropertyId;
  const currentTimeline =
    (activeScopeMatches
      ? timelineSections.find((section) => section.id === galleryState.sectionId)
      : null) ??
    timelineSections[0] ??
    null;
  const currentTimelineIndex = currentTimeline
    ? timelineSections.findIndex((section) => section.id === currentTimeline.id)
    : -1;
  const currentTimelineItem =
    (activeScopeMatches && currentTimeline && galleryState.sectionId === currentTimeline.id
      ? currentTimeline.items.find((item) => item.id === galleryState.serviceId)
      : null) ??
    currentTimeline?.items[0] ??
    null;
  const currentTimelineItemIndex =
    currentTimeline && currentTimelineItem
      ? currentTimeline.items.findIndex((item) => item.id === currentTimelineItem.id)
      : -1;
  const [beforePhotoState, setBeforePhotoState] = useState<ProtectedAssetLoadState>('idle');
  const [afterPhotoState, setAfterPhotoState] = useState<ProtectedAssetLoadState>('idle');
  const comparePosition =
    activeScopeMatches && currentTimeline && galleryState.sectionId === currentTimeline.id
      ? galleryState.comparePosition
      : 50;
  const mapQuery = buildMapQuery(selectedProperty);
  const mapEmbedUrl = mapQuery
    ? `https://www.google.com/maps?q=${encodeURIComponent(mapQuery)}&output=embed`
    : '';
  const mapOpenUrl = mapQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapQuery)}`
    : '';

  const heroImageUrl = selectedProperty?.coverImageUrl ?? null;
  const totalStoryUnits =
    selectedProperty?.stories.reduce((total, story) => total + story.units.length, 0) ?? 0;
  const propertyAlerts = buildPropertyAlerts(selectedProperty, propertyJobs);
  const isCreateMode = editorMode === 'create';
  const editorTitle = isCreateMode ? 'Register new property' : 'Edit property details';

  const statusChart = buildDistribution(
    propertyJobs.map((job) => job.statusLabel || job.status),
    workStatusColor,
  );
  const paymentChart = buildDistribution(
    propertyJobs.map((job) => job.paymentStatusLabel || job.paymentStatus),
    paymentStatusColor,
  );
  const beforePhotoId = currentTimelineItem?.before?.file.id ?? '';
  const afterPhotoId = currentTimelineItem?.after?.file.id ?? '';
  const shouldShowAfterOnly = Boolean(currentTimelineItem?.after) && (!currentTimelineItem?.before || beforePhotoState === 'error');
  const shouldShowBeforeOnly = Boolean(currentTimelineItem?.before) && (!currentTimelineItem?.after || afterPhotoState === 'error');

  useEffect(() => {
    setBeforePhotoState(currentTimelineItem?.before ? 'loading' : 'idle');
  }, [beforePhotoId]);

  useEffect(() => {
    setAfterPhotoState(currentTimelineItem?.after ? 'loading' : 'idle');
  }, [afterPhotoId]);

  const goToPreviousSlide = () => {
    if (!timelineSections.length) return;
    const nextIndex =
      currentTimelineIndex <= 0 ? timelineSections.length - 1 : currentTimelineIndex - 1;
    const nextSection = timelineSections[nextIndex];
    setGalleryState({
      propertyId: selectedPropertyId,
      sectionId: nextSection?.id ?? '',
      serviceId: nextSection?.items[0]?.id ?? '',
      comparePosition: 50,
    });
  };

  const goToNextSlide = () => {
    if (!timelineSections.length) return;
    const nextIndex =
      currentTimelineIndex < 0 || currentTimelineIndex === timelineSections.length - 1
        ? 0
        : currentTimelineIndex + 1;
    const nextSection = timelineSections[nextIndex];
    setGalleryState({
      propertyId: selectedPropertyId,
      sectionId: nextSection?.id ?? '',
      serviceId: nextSection?.items[0]?.id ?? '',
      comparePosition: 50,
    });
  };

  const handleCoverUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadCover(file);
    }
    event.target.value = '';
  };

  return (
    <section className="tab-panel">
      <div className="panel property-shell">
        {!isRegisterScreen ? (
          <div className="property-shell-head">
            <div>
              <p className="page-kicker">Property Info</p>
              <h2 className="title-with-icon">
                <UiIcon name="home" />
                <span>Property Information</span>
              </h2>
              <p>Browse a property, review its gallery and activity, and manage the portfolio in one place.</p>
            </div>
          </div>
        ) : null}

        <div className="form-grid">
          <label className="span-2">
            Property
            <select value={selectedPropertyId} onChange={(event) => onSelect(event.target.value)}>
              {properties.length ? null : <option value="">No properties yet</option>}
              {properties.map((property) => (
                <option key={property.id} value={property.id}>
                  {property.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        {isRegisterScreen ? (
          <div className="shell-section-card property-editor-shell">
            <div className="panel-head">
              <div>
                <h2 className="title-with-icon title-with-icon--sm">
                  <UiIcon name="settings" />
                  <span>{editorTitle}</span>
                </h2>
              </div>
            </div>

            <div className="property-editor-mode-row">
              <button
                type="button"
                className={`ghost-button ${isCreateMode ? 'is-active' : ''}`}
                onClick={onStartCreate}
              >
                <UiIcon name="plus" />
                Register new property
              </button>
              <button
                type="button"
                className={`ghost-button ${!isCreateMode ? 'is-active' : ''}`}
                onClick={onStartEditSelected}
                disabled={!selectedProperty}
              >
                <UiIcon name="home" />
                Edit selected property
              </button>
            </div>

            {propertyAlerts.length && !isCreateMode ? (
              <div className="property-alert-grid">
                {propertyAlerts.map((alert) => (
                  <div key={alert.label} className={`property-alert-card property-alert-card--${alert.tone}`}>
                    <strong className="field-label-inline">
                      <UiIcon name={alert.icon} size={15} />
                      <span>{alert.label}</span>
                    </strong>
                    <p>{alert.text}</p>
                  </div>
                ))}
              </div>
            ) : null}

            <form className="form-grid property-editor-form" onSubmit={onSubmit}>
              <label>
                Property Name
                <input value={form.name} onChange={(event) => onFieldChange('name', event.target.value)} />
              </label>

              <label>
                Main Photo URL
                <input
                  value={form.coverImageUrl}
                  onChange={(event) => onFieldChange('coverImageUrl', event.target.value)}
                  placeholder="https://..."
                />
              </label>

              <label>
                Address
                <input value={form.address} onChange={(event) => onFieldChange('address', event.target.value)} />
              </label>

              <label>
                City Line
                <input value={form.cityLine} onChange={(event) => onFieldChange('cityLine', event.target.value)} />
              </label>

              <label className="span-2">
                Notes
                <textarea
                  rows={3}
                  value={form.notes}
                  onChange={(event) => onFieldChange('notes', event.target.value)}
                  placeholder="Internal notes for this property"
                />
              </label>

              <div className="span-2 property-cover-actions">
                <label className="ghost-button property-upload-button">
                  <UiIcon name="image" />
                  {isUploadingCover ? 'Uploading cover...' : 'Upload main photo'}
                  <input
                    type="file"
                    accept="image/*"
                    hidden
                    disabled={isUploadingCover || isClearingCover || isCreateMode}
                    onChange={handleCoverUpload}
                  />
                </label>

                <button
                  type="button"
                  className="ghost-button"
                  disabled={isCreateMode || isUploadingCover || isClearingCover || (!form.coverImageUrl && !heroImageUrl)}
                  onClick={onClearCover}
                >
                  <UiIcon name="trash" />
                  {isClearingCover ? 'Removing photo...' : 'Clear main photo'}
                </button>

                {isCreateMode ? (
                  <span className="property-editor-help">
                    Save the property first if you want to upload the main photo from your device.
                  </span>
                ) : null}
              </div>

              <div className="span-2 property-structure-section">
                <div className="property-structure-head">
                  <div>
                    <h3>Story by story, unit by unit</h3>
                  </div>

                  <button type="button" className="ghost-button" onClick={onAddStory}>
                    <UiIcon name="plus" />
                    Add story
                  </button>
                </div>

                {form.stories.length ? (
                  <div className="property-story-list">
                    {form.stories.map((story, storyIndex) => (
                      <article key={story.id} className="property-story-card">
                        <div className="property-story-head">
                          <label className="property-story-title">
                            <span>Story</span>
                            <input
                              value={story.label}
                              onChange={(event) =>
                                onStoryChange(story.id, 'label', event.target.value)
                              }
                              placeholder={`Story ${storyIndex + 1}`}
                            />
                          </label>

                          <div className="property-story-actions">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => onAddUnit(story.id)}
                            >
                              <UiIcon name="plus" />
                              Add unit
                            </button>
                            <button
                              type="button"
                              className="ghost-button danger"
                              onClick={() => onRemoveStory(story.id)}
                            >
                              <UiIcon name="trash" />
                              Remove story
                            </button>
                          </div>
                        </div>

                        {story.units.length ? (
                          <div className="property-unit-list">
                            {story.units.map((unit, unitIndex) => (
                              <article key={unit.id} className="property-unit-card">
                                <div className="property-unit-head">
                                  <label className="property-unit-title">
                                    <span>Unit</span>
                                    <input
                                      value={unit.label}
                                      onChange={(event) =>
                                        onUnitChange(story.id, unit.id, 'label', event.target.value)
                                      }
                                      placeholder={`Unit ${unitIndex + 1}`}
                                    />
                                  </label>

                                  <button
                                    type="button"
                                    className="ghost-button danger"
                                    onClick={() => onRemoveUnit(story.id, unit.id)}
                                  >
                                    <UiIcon name="trash" />
                                    Remove unit
                                  </button>
                                </div>

                                <div className="property-unit-fields-grid">
                                  {propertyUnitSpecFields.map((field) => (
                                    <label key={`${unit.id}-${field.key}`}>
                                      {field.label}
                                      <input
                                        value={unit[field.key]}
                                        onChange={(event) =>
                                          onUnitChange(story.id, unit.id, field.key, event.target.value)
                                        }
                                        type="number"
                                        min="0"
                                        step="1"
                                        inputMode="numeric"
                                        placeholder="0"
                                      />
                                    </label>
                                  ))}
                                </div>
                              </article>
                            ))}
                          </div>
                        ) : (
                          <div className="empty-box">
                            Add the units or tenants that belong to this story before saving.
                          </div>
                        )}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-box">
                    Start by adding a story, then create the units or tenants inside it.
                  </div>
                )}
              </div>

              <div className="actions-row span-2">
                <button type="submit" disabled={isSaving}>
                  <UiIcon name="settings" />
                  {isSaving
                    ? isCreateMode
                      ? 'Creating property...'
                      : 'Saving property...'
                    : isCreateMode
                      ? 'Create property'
                      : 'Save property details'}
                </button>
                {!isCreateMode && selectedProperty ? (
                  <button
                    type="button"
                    className="records-danger-button"
                    onClick={() => onDelete(selectedProperty.id)}
                  >
                    <UiIcon name="trash" />
                    Delete property
                  </button>
                ) : null}
              </div>
            </form>
          </div>
        ) : null}

        {!isRegisterScreen && selectedProperty ? (
          <>
            <div className="property-overview-grid">
              <div className="property-summary-card shell-section-card">
                <div className="property-summary-copy">
                  <h3>{selectedProperty.name}</h3>
                  {selectedProperty.cityLine ? <p className="muted-copy">{selectedProperty.cityLine}</p> : null}
                </div>

                <div className="property-summary-media">
                  {heroImageUrl ? (
                    <ProtectedAssetImage
                      className="property-hero-image"
                      src={heroImageUrl}
                      alt={selectedProperty.name}
                      loadingFallback={
                        <div className="image-placeholder property-image-placeholder">
                          <strong>Loading property photo...</strong>
                          <span>Please wait while the saved image opens.</span>
                        </div>
                      }
                      errorFallback={(message) => (
                        <div className="image-placeholder property-image-placeholder">
                          <strong>Could not load property photo</strong>
                          <span>{message}</span>
                        </div>
                      )}
                    />
                  ) : (
                    <div className="image-placeholder property-image-placeholder">
                      <strong>Property photo placeholder</strong>
                      <span>This area is reserved for the main property photo, not job progress files.</span>
                    </div>
                  )}
                </div>

                {selectedProperty.notes ? (
                  <div className="property-notes-card">
                    <p className="eyebrow">Notes</p>
                    <p>{selectedProperty.notes}</p>
                  </div>
                ) : null}
              </div>

              <div className="property-specifications-card shell-section-card">
                <div className="panel-head">
                  <div>
                    <h2 className="title-with-icon title-with-icon--sm">
                      <UiIcon name="clipboard" />
                      <span>What the house has</span>
                    </h2>
                  </div>
                </div>

                {selectedProperty.stories.length ? (
                  <PropertyStructureLaunchCard
                    storyCount={selectedProperty.stories.length}
                    unitCount={totalStoryUnits}
                    onOpen={() => setIsStructureDialogOpen(true)}
                  />
                ) : (
                  <div className="empty-box">
                    This property does not have a story and unit breakdown yet. Register it in
                    Property register to see the house data here.
                  </div>
                )}
              </div>
            </div>

            <div className="property-media-grid">
              <div className="shell-section-card property-map-card">
                <div className="panel-head">
                  <div>
                    <h2 className="title-with-icon title-with-icon--sm">
                      <UiIcon name="map" />
                      <span>Map</span>
                    </h2>
                  </div>
                </div>

                {mapEmbedUrl ? (
                  <iframe
                    className="property-map-frame"
                    src={mapEmbedUrl}
                    title={`Map for ${selectedProperty.name}`}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                  />
                ) : (
                  <div className="empty-box">Add an address or city line to show the map.</div>
                )}

                {mapOpenUrl ? (
                  <div className="map-action-row">
                    <a className="map-button" href={mapOpenUrl} target="_blank" rel="noreferrer">
                      <UiIcon name="map" size={16} />
                      Open in Google Maps
                    </a>
                  </div>
                ) : null}
              </div>

              <div className="shell-section-card">
                <div className="panel-head">
                  <div>
                    <h2 className="title-with-icon title-with-icon--sm">
                      <UiIcon name="image" />
                      <span>Photo timeline</span>
                    </h2>
                  </div>
                  <div className="carousel-controls">
                    <button type="button" className="ghost-button carousel-arrow" onClick={goToPreviousSlide}>
                      &lt;
                    </button>
                    <span className="pill tone-neutral">
                      {timelineSections.length && currentTimelineIndex >= 0
                        ? `${currentTimelineIndex + 1} / ${timelineSections.length}`
                        : '0 / 0'}
                    </span>
                    <button type="button" className="ghost-button carousel-arrow" onClick={goToNextSlide}>
                      &gt;
                    </button>
                  </div>
                </div>

                {currentTimeline ? (
                  <div className="carousel-card photo-timeline-card">
                    <div className="photo-timeline-headline">
                      <div className="photo-timeline-heading-copy">
                        <strong>{currentTimeline.section}</strong>
                      </div>
                      <span className="pill tone-neutral">
                        {currentTimelineItem && currentTimelineItemIndex >= 0
                          ? `${currentTimelineItemIndex + 1} / ${currentTimeline.items.length}`
                          : '0 / 0'}
                      </span>
                    </div>

                    <div className="photo-timeline-service-strip">
                      {currentTimeline.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`photo-timeline-service-pill ${
                            item.id === currentTimelineItem?.id ? 'is-active' : ''
                          }`}
                          onClick={() =>
                            setGalleryState({
                              propertyId: selectedPropertyId,
                              sectionId: currentTimeline.id,
                              serviceId: item.id,
                              comparePosition: 50,
                            })
                          }
                        >
                          {formatAreaServiceLabel(item.area, item.service)}
                        </button>
                      ))}
                    </div>

                    <div
                      className={`before-after-compare ${
                        shouldShowAfterOnly || shouldShowBeforeOnly ? 'before-after-compare--single' : ''
                      }`.trim()}
                    >
                      {shouldShowAfterOnly ? (
                        <div className="before-after-stage before-after-stage--single">
                          <ProtectedAssetImage
                            className="before-after-image"
                            src={currentTimelineItem?.after?.file.url ?? null}
                            alt={`After - ${currentTimeline.section} - ${formatAreaServiceLabel(currentTimelineItem?.area ?? '', currentTimelineItem?.service ?? '')}`}
                            mimeType={currentTimelineItem?.after?.file.mimeType}
                            onStateChange={setAfterPhotoState}
                            loadingFallback={
                              <div className="before-after-empty">
                                <strong>Loading after photo...</strong>
                                <span>Please wait while the file opens.</span>
                              </div>
                            }
                            errorFallback={(message) => (
                              <div className="before-after-empty">
                                <strong>Could not load the after photo</strong>
                                <span>{message}</span>
                              </div>
                            )}
                          />
                          <div className="before-after-single-note">
                            <strong>Before photo unavailable</strong>
                            <span>Showing the available after image while the older before file is missing.</span>
                          </div>
                        </div>
                      ) : shouldShowBeforeOnly ? (
                        <div className="before-after-stage before-after-stage--single">
                          <ProtectedAssetImage
                            className="before-after-image"
                            src={currentTimelineItem?.before?.file.url ?? null}
                            alt={`Before - ${currentTimeline.section} - ${formatAreaServiceLabel(currentTimelineItem?.area ?? '', currentTimelineItem?.service ?? '')}`}
                            mimeType={currentTimelineItem?.before?.file.mimeType}
                            onStateChange={setBeforePhotoState}
                            loadingFallback={
                              <div className="before-after-empty">
                                <strong>Loading before photo...</strong>
                                <span>Please wait while the file opens.</span>
                              </div>
                            }
                            errorFallback={(message) => (
                              <div className="before-after-empty">
                                <strong>Could not load the before photo</strong>
                                <span>{message}</span>
                              </div>
                            )}
                          />
                          <div className="before-after-single-note">
                            <strong>After photo unavailable</strong>
                            <span>Showing the available before image while the older after file is missing.</span>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="before-after-stage before-after-stage--after">
                            {currentTimelineItem?.after ? (
                              <ProtectedAssetImage
                                className="before-after-image"
                                src={currentTimelineItem.after.file.url}
                                alt={`After - ${currentTimeline.section} - ${formatAreaServiceLabel(currentTimelineItem.area, currentTimelineItem.service)}`}
                                mimeType={currentTimelineItem.after.file.mimeType}
                                onStateChange={setAfterPhotoState}
                                loadingFallback={
                                  <div className="before-after-empty">
                                    <strong>Loading after photo...</strong>
                                    <span>Please wait while the file opens.</span>
                                  </div>
                                }
                                errorFallback={(message) => (
                                  <div className="before-after-empty">
                                    <strong>Could not load the after photo</strong>
                                    <span>{message}</span>
                                  </div>
                                )}
                              />
                            ) : (
                              <div className="before-after-empty">
                                <strong>No after photo yet</strong>
                                <span>Save an After image in this location to complete the comparison.</span>
                              </div>
                            )}
                          </div>

                          <div
                            className="before-after-stage before-after-stage--before"
                            style={{ clipPath: `inset(0 ${100 - comparePosition}% 0 0)` }}
                          >
                            {currentTimelineItem?.before ? (
                              <ProtectedAssetImage
                                className="before-after-image"
                                src={currentTimelineItem.before.file.url}
                                alt={`Before - ${currentTimeline.section} - ${formatAreaServiceLabel(currentTimelineItem.area, currentTimelineItem.service)}`}
                                mimeType={currentTimelineItem.before.file.mimeType}
                                onStateChange={setBeforePhotoState}
                                loadingFallback={
                                  <div className="before-after-empty">
                                    <strong>Loading before photo...</strong>
                                    <span>Please wait while the file opens.</span>
                                  </div>
                                }
                                errorFallback={(message) => (
                                  <div className="before-after-empty">
                                    <strong>Could not load the before photo</strong>
                                    <span>{message}</span>
                                  </div>
                                )}
                              />
                            ) : (
                              <div className="before-after-empty">
                                <strong>No before photo yet</strong>
                                <span>Save a Before image in this location to start the comparison.</span>
                              </div>
                            )}
                          </div>

                          <div className="before-after-overlay">
                            <div className="before-after-badges">
                              <span className="pill tone-neutral">Before</span>
                              <span className="pill tone-neutral">After</span>
                            </div>

                            <div className="before-after-divider" style={{ left: `${comparePosition}%` }}>
                              <span className="before-after-handle" />
                            </div>

                            <input
                              className="before-after-range"
                              type="range"
                              min="0"
                              max="100"
                              value={comparePosition}
                              onChange={(event) =>
                                setGalleryState({
                                  propertyId: selectedPropertyId,
                                  sectionId: currentTimeline?.id ?? '',
                                  serviceId: currentTimelineItem?.id ?? '',
                                  comparePosition: Number(event.target.value),
                                })
                              }
                              aria-label={`Compare before and after photos for ${currentTimeline.section} - ${formatAreaServiceLabel(currentTimelineItem?.area ?? '', currentTimelineItem?.service ?? '')}`}
                            />
                          </div>
                        </>
                      )}
                    </div>

                    <div className="carousel-caption photo-timeline-caption">
                      <div>
                        <strong>Story / Unit</strong>
                        <span>{currentTimeline.section}</span>
                      </div>
                      <div>
                        <strong>Area</strong>
                        <span>{currentTimelineItem?.area || 'Pending'}</span>
                      </div>
                      <div>
                        <strong>Service</strong>
                        <span>{currentTimelineItem?.service ?? 'Pending'}</span>
                      </div>
                      <div>
                        <strong>Comparison</strong>
                        <span>Before / After</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="empty-box">
                    No Before / After photos yet for this property.
                  </div>
                )}
              </div>
            </div>

            <div className="property-dashboard-grid">
              <PropertyStatusChartCard
                title="Status Distribution"
                chart={statusChart}
                icon="chart"
              />
              <PropertyPaymentChartCard
                title="Payment Distribution"
                chart={paymentChart}
                icon="dollar"
              />
            </div>
            <PropertyStructureDialog
              open={isStructureDialogOpen}
              propertyName={selectedProperty.name}
              stories={selectedProperty.stories}
              onClose={() => setIsStructureDialogOpen(false)}
            />
          </>
        ) : !isRegisterScreen ? (
          <div className="empty-box">Select a property first to load the map, photos and dashboards.</div>
        ) : null}
      </div>
    </section>
  );
}

function buildMapQuery(property: PropertySummary | null) {
  if (!property) return '';

  return [property.name, property.address, property.cityLine].filter(Boolean).join(', ');
}

function buildDistribution(
  labels: string[],
  colorForLabel: (label: string, index: number) => string,
) {
  const counts = new Map<string, number>();

  labels.forEach((label) => {
    counts.set(label, (counts.get(label) ?? 0) + 1);
  });

  const items = Array.from(counts.entries()).map(([label, value], index) => ({
    label,
    value,
    color: colorForLabel(label, index),
  }));
  const total = items.reduce((sum, item) => sum + item.value, 0);

  if (!items.length || total === 0) {
    return {
      total: 0,
      items: [],
      gradient: 'conic-gradient(#e9f2fb 0deg 360deg)',
    };
  }

  let currentAngle = 0;
  const segments = items.map((item) => {
    const start = currentAngle;
    currentAngle += (item.value / total) * 360;
    return `${item.color} ${start}deg ${currentAngle}deg`;
  });

  return {
    total,
    items,
    gradient: `conic-gradient(${segments.join(', ')})`,
  };
}

function buildSectionTimeline(jobs: JobRow[]): SectionTimelineItem[] {
  const groups = new Map<
    string,
    {
      section: string;
      services: Map<
        string,
        {
          area: string;
          service: string;
          beforeEntries: Array<{ file: JobFile; service: string }>;
          afterEntries: Array<{ file: JobFile; service: string }>;
        }
      >;
    }
  >();

  jobs.forEach((job) => {
    const section = [job.story.trim(), job.unit.trim()].filter(Boolean).join(' / ') || 'Whole property';
    const area = job.area.trim();
    const service = job.service.trim() || 'General Service';
    const serviceKey = `${area.toLowerCase()}::${service.toLowerCase()}`;
    const current = groups.get(section) ?? {
      section,
      services: new Map(),
    };

    const currentService = current.services.get(serviceKey) ?? {
      area,
      service,
      beforeEntries: [],
      afterEntries: [],
    };

    job.files.before.forEach((file) => {
      currentService.beforeEntries.push({ file, service: job.service });
    });

    job.files.after.forEach((file) => {
      currentService.afterEntries.push({ file, service: job.service });
    });

    current.services.set(serviceKey, currentService);
    groups.set(section, current);
  });

  return Array.from(groups.values())
    .map((group) => ({
      id: group.section.toLowerCase().replace(/\s+/g, '-'),
      section: group.section,
      items: Array.from(group.services.values())
        .map((serviceGroup) => ({
          id: `${group.section}-${serviceGroup.area}-${serviceGroup.service}`.toLowerCase().replace(/\s+/g, '-'),
          area: serviceGroup.area,
          service: serviceGroup.service,
          before: pickTimelineEntry(serviceGroup.beforeEntries, 'asc'),
          after: pickTimelineEntry(serviceGroup.afterEntries, 'desc'),
        }))
        .filter((item) => item.before && item.after)
        .sort((left, right) =>
          formatAreaServiceLabel(left.area, left.service).localeCompare(
            formatAreaServiceLabel(right.area, right.service),
          ),
        ),
    }))
    .filter((group) => group.items.length > 0)
    .sort((left, right) => left.section.localeCompare(right.section));
}

function buildPropertyAlerts(property: PropertySummary | null, jobs: JobRow[]) {
  if (!property) return [];

  const missingSpecsCount = propertyUnitSpecFields.filter(
    (field) => property[field.key] === null,
  ).length;
  const totalUnits = property.stories.reduce((total, story) => total + story.units.length, 0);

  const jobsWithoutPhotos = jobs.filter(
    (job) => !job.files.before.length || !job.files.after.length,
  ).length;

  return [
    !property.coverImageUrl
      ? {
          tone: 'warning',
          icon: 'image' as UiIconName,
          label: 'Main photo missing',
          text: 'Upload the main property photo so the cover area stops using a placeholder.',
        }
      : null,
    !property.address
      ? {
          tone: 'warning',
          icon: 'map' as UiIconName,
          label: 'Address incomplete',
          text: 'Add a full address to improve the map and document output.',
        }
      : null,
    !property.stories.length
      ? {
          tone: 'neutral',
          icon: 'building' as UiIconName,
          label: 'Story breakdown pending',
          text: 'Add the stories and units of this property so the house structure is clearly organized.',
        }
      : null,
    property.stories.length > 0 && totalUnits === 0
      ? {
          tone: 'neutral',
          icon: 'home' as UiIconName,
          label: 'Units pending',
          text: 'At least one story is registered, but it still needs units or tenants inside it.',
        }
      : null,
    missingSpecsCount > 0
      ? {
          tone: 'neutral',
          icon: 'clipboard' as UiIconName,
          label: 'House data pending',
          text: `${missingSpecsCount} house specification field(s) are still missing.`,
        }
      : null,
    jobsWithoutPhotos > 0
      ? {
          tone: 'danger',
          icon: 'camera' as UiIconName,
          label: 'Photo evidence pending',
          text: `${jobsWithoutPhotos} job(s) in this property are missing a before or after photo.`,
        }
      : null,
  ].filter((item): item is { tone: 'warning' | 'neutral' | 'danger'; icon: UiIconName; label: string; text: string } => Boolean(item));
}

function pickTimelineEntry(
  entries: Array<{ file: JobFile; service: string }>,
  order: 'asc' | 'desc',
) {
  if (!entries.length) return null;

  return [...entries].sort((left, right) => {
    const leftTime = new Date(left.file.createdAt).getTime();
    const rightTime = new Date(right.file.createdAt).getTime();
    return order === 'asc' ? leftTime - rightTime : rightTime - leftTime;
  })[0];
}

function PropertyStructureLaunchCard({
  storyCount,
  unitCount,
  onOpen,
}: {
  storyCount: number;
  unitCount: number;
  onOpen: () => void;
}) {
  return (
    <div className="property-layout-launcher">
      <div className="property-layout-launcher-grid">
        <div className="property-layout-launcher-card">
          <span className="property-layout-launcher-icon">
            <UiIcon name="building" size={18} />
          </span>
          <div>
            <span>Stories</span>
            <strong>{storyCount}</strong>
          </div>
        </div>
        <div className="property-layout-launcher-card property-layout-launcher-card--mint">
          <span className="property-layout-launcher-icon property-layout-launcher-icon--mint">
            <UiIcon name="home" size={18} />
          </span>
          <div>
            <span>Units</span>
            <strong>{unitCount}</strong>
          </div>
        </div>
      </div>

      <div className="property-layout-launcher-actions">
        <p>Open the story layout in a separate window.</p>
        <button type="button" onClick={onOpen}>
          <UiIcon name="search" size={15} />
          View stories and units
        </button>
      </div>
    </div>
  );
}

function PropertyStructureDialog({
  open,
  propertyName,
  stories,
  onClose,
}: {
  open: boolean;
  propertyName: string;
  stories: PropertyStory[];
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="property-layout-dialog-backdrop" role="presentation" onClick={onClose}>
      <div
        className="property-layout-dialog-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="property-layout-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="property-layout-dialog-head">
          <div>
            <p className="eyebrow">Property layout</p>
            <h2 id="property-layout-dialog-title">{propertyName}</h2>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="property-layout-dialog-body">
          <PropertyStructureViewer stories={stories} />
        </div>
      </div>
    </div>
  );
}

function PropertyStructureViewer({
  stories,
}: {
  stories: PropertyStory[];
}) {
  const [selectedStoryId, setSelectedStoryId] = useState<string>('all');
  const [selectedUnitByStory, setSelectedUnitByStory] = useState<Record<string, string>>({});

  const totalUnits = stories.reduce((total, story) => total + story.units.length, 0);
  const storyOrder = new Map(stories.map((story, index) => [story.id, index + 1]));
  const activeStoryId =
    selectedStoryId === 'all' || stories.some((story) => story.id === selectedStoryId)
      ? selectedStoryId
      : 'all';
  const visibleStories =
    activeStoryId === 'all'
      ? stories
      : stories.filter((story) => story.id === activeStoryId);

  return (
    <div className="property-structure-viewer">
      <div className="property-structure-filter-bar">
        <div className="property-structure-filter-group">
          <div className="property-structure-filter-head">
            <span className="property-structure-filter-label">Stories</span>
            <div className="property-structure-filter-meta">
              <span className="property-structure-mini-chip property-structure-mini-chip--soft">
                <UiIcon name="building" size={13} />
                {stories.length}
              </span>
              <span className="property-structure-mini-chip property-structure-mini-chip--soft">
                <UiIcon name="home" size={13} />
                {totalUnits}
              </span>
            </div>
          </div>
          <div className="property-structure-filter-chips">
            <button
              type="button"
              className={`property-filter-chip ${activeStoryId === 'all' ? 'is-active' : ''}`}
              onClick={() => setSelectedStoryId('all')}
            >
              <UiIcon name="dashboard" size={14} />
              All stories
            </button>
            {stories.map((story) => (
              <button
                key={story.id}
                type="button"
                className={`property-filter-chip ${activeStoryId === story.id ? 'is-active' : ''}`}
                onClick={() => setSelectedStoryId(story.id)}
              >
                <UiIcon name="building" size={14} />
                {story.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="property-story-panel-list">
        {visibleStories.map((story) => (
          <PropertyStoryPanel
            key={story.id}
            story={story}
            storyNumber={storyOrder.get(story.id) ?? 1}
            selectedUnitId={
              selectedUnitByStory[story.id] &&
              story.units.some((unit) => unit.id === selectedUnitByStory[story.id])
                ? selectedUnitByStory[story.id]
                : 'all'
            }
            onSelectUnit={(unitId) =>
              setSelectedUnitByStory((current) => ({ ...current, [story.id]: unitId }))
            }
          />
        ))}
      </div>
    </div>
  );
}

function PropertyStoryPanel({
  story,
  storyNumber,
  selectedUnitId,
  onSelectUnit,
}: {
  story: PropertyStory;
  storyNumber: number;
  selectedUnitId: string;
  onSelectUnit: (unitId: string) => void;
}) {
  const visibleUnits =
    selectedUnitId === 'all'
      ? story.units
      : story.units.filter((unit) => unit.id === selectedUnitId);
  const unitOrder = new Map(story.units.map((unit, index) => [unit.id, index + 1]));

  return (
    <article className="property-story-panel">
      <div className="property-story-panel-head">
        <div className="property-story-panel-title">
          <span className="property-story-panel-icon">
            <UiIcon name="building" size={17} />
          </span>
          <div className="property-story-panel-copy">
            <p className="eyebrow">Story {storyNumber}</p>
            <h3>{story.label}</h3>
          </div>
        </div>

        <div className="property-story-panel-meta">
          <span className="property-structure-mini-chip">
            <UiIcon name="home" size={13} />
            {story.units.length} unit{story.units.length === 1 ? '' : 's'}
          </span>
          <span className="property-structure-mini-chip">
            <UiIcon name="search" size={13} />
            {visibleUnits.length === story.units.length ? 'All' : `${visibleUnits.length} selected`}
          </span>
        </div>
      </div>

      {story.units.length > 1 ? (
        <div className="property-unit-filter-bar">
          <span className="property-structure-filter-label">Units</span>
          <div className="property-structure-filter-chips">
            <button
              type="button"
              className={`property-filter-chip ${selectedUnitId === 'all' ? 'is-active' : ''}`}
              onClick={() => onSelectUnit('all')}
            >
              <UiIcon name="home" size={14} />
              All units
            </button>
            {story.units.map((unit) => (
              <button
                key={unit.id}
                type="button"
                className={`property-filter-chip ${selectedUnitId === unit.id ? 'is-active' : ''}`}
                onClick={() => onSelectUnit(unit.id)}
              >
                <UiIcon name="home" size={14} />
                {unit.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {visibleUnits.length ? (
        <div className="property-unit-card-grid">
          {visibleUnits.map((unit) => (
            <PropertyUnitCard
              key={unit.id}
              unit={unit}
              unitNumber={unitOrder.get(unit.id) ?? 1}
            />
          ))}
        </div>
      ) : (
        <div className="empty-box">No units match the current filter.</div>
      )}
    </article>
  );
}

function PropertyUnitCard({
  unit,
  unitNumber,
}: {
  unit: PropertyUnit;
  unitNumber: number;
}) {
  const unitValues = propertyUnitSpecFields.filter((field) => unit[field.key] != null && unit[field.key] !== 0);

  return (
    <article className="property-unit-view-card">
      <div className="property-unit-view-head">
        <div className="property-unit-view-title">
          <span className="property-unit-view-icon">
            <UiIcon name="home" size={16} />
          </span>
          <div>
            <p className="eyebrow">Unit {unitNumber}</p>
            <h4>{unit.label}</h4>
          </div>
        </div>
        <span className="property-structure-mini-chip property-structure-mini-chip--soft">
          <UiIcon name="clipboard" size={13} />
          {unitValues.length}
        </span>
      </div>

      {unitValues.length ? (
        <div className="property-unit-spec-grid">
          {unitValues.map((field) => (
            <div key={field.key} className="property-unit-spec-item">
              <span className="property-unit-spec-icon">
                <UiIcon name={field.icon} size={16} />
              </span>
              <div>
                <span>{field.label}</span>
                <strong>{unit[field.key]}</strong>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="property-structure-empty">No counts saved yet for this unit.</div>
      )}
    </article>
  );
}

type PropertyDashboardChart = {
  total: number;
  items: Array<{ label: string; value: number; color: string }>;
  gradient: string;
};

function PropertyStatusChartCard({
  title,
  subtitle,
  chart,
  icon = 'chart',
}: {
  title: string;
  subtitle?: string;
  chart: PropertyDashboardChart;
  icon?: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const activeItem = chart.items.find((item) => item.label === selectedLabel) ?? chart.items[0] ?? null;
  const activePercent = activeItem && chart.total ? Math.round((activeItem.value / chart.total) * 100) : 0;
  const activeColor = activeItem?.color ?? '#92ccf8';
  const maxValue = Math.max(...chart.items.map((item) => item.value), 0);
  const topItem =
    chart.items.reduce<{ label: string; value: number } | null>((current, item) => {
      if (!current || item.value > current.value) {
        return { label: item.label, value: item.value };
      }

      return current;
    }, null) ?? activeItem;
  const plotWidth = 470;
  const plotHeight = 282;
  const plotPadding = { top: 18, right: 12, bottom: 42, left: 36 };
  const baseline = plotHeight - plotPadding.bottom;
  const plotInnerHeight = baseline - plotPadding.top;
  const slotWidth = chart.items.length
    ? (plotWidth - plotPadding.left - plotPadding.right) / chart.items.length
    : 0;
  const barWidth = Math.min(26, Math.max(16, slotWidth * 0.4));
  const points = chart.items.map((item, index) => {
    const height = maxValue ? Math.max((item.value / maxValue) * (plotInnerHeight - 12), 18) : 18;
    const centerX = plotPadding.left + slotWidth * index + slotWidth / 2;

    return {
      item,
      centerX,
      x: centerX - barWidth / 2,
      y: baseline - height,
      height,
    };
  });
  const trendPoints = points.map((point) => ({
    x: point.centerX,
    y: Math.max(plotPadding.top + 8, point.y - 10),
  }));
  const trendPath = buildSmoothLinePath(trendPoints);
  const arrowPath =
    trendPoints.length > 1
      ? buildArrowHeadPath(trendPoints[trendPoints.length - 2], trendPoints[trendPoints.length - 1], 10)
      : '';
  const activePoint = points.find((point) => point.item.label === activeItem?.label) ?? points[0] ?? null;
  const gridSteps = [1, 0.75, 0.5, 0.25, 0].map((ratio) => ({
    ratio,
    value: Math.round(maxValue * ratio),
    y: baseline - plotInnerHeight * ratio,
  }));

  return (
    <div className="donut-panel shell-section-card">
      {chart.items.length && activeItem ? (
        <div className="property-chart-panel property-chart-panel--analysis">
          <div
            className="property-chart-hero"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(activeColor, 0.98)}, ${hexToRgba(activeColor, 0.72)})`,
            }}
          >
            <div className="property-chart-hero-copy">
              <h2 className="title-with-icon title-with-icon--sm">
                <UiIcon name={icon} />
                <span>{title}</span>
              </h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>

            <div className="property-chart-hero-stat">
              <span className="property-chart-hero-badge">{activePercent}%</span>
              <div className="property-chart-hero-meta">
                <strong>{activeItem.label}</strong>
                <small>{formatJobCountLabel(activeItem.value)}</small>
              </div>
            </div>
          </div>

          <div className="property-analysis-board">
            <div className="property-analysis-stage">
              <svg
                viewBox={`0 0 ${plotWidth} ${plotHeight}`}
                className="property-analysis-svg"
                role="img"
                aria-label={`${title} chart`}
              >
                {gridSteps.map((step) => (
                  <g key={`grid-${step.ratio}`}>
                    <line
                      className="property-analysis-grid-line"
                      x1={plotPadding.left}
                      y1={step.y}
                      x2={plotWidth - plotPadding.right}
                      y2={step.y}
                    />
                    <text
                      className="property-analysis-axis-label"
                      x={plotPadding.left - 10}
                      y={step.y + (step.ratio === 0 ? -2 : 4)}
                      textAnchor="end"
                    >
                      {step.value}
                    </text>
                  </g>
                ))}

                {activePoint ? (
                  <line
                    className="property-analysis-focus-line"
                    x1={activePoint.centerX}
                    y1={plotPadding.top}
                    x2={activePoint.centerX}
                    y2={baseline}
                  />
                ) : null}

                {points.map((point, index) => {
                  const isActive = point.item.label === activeItem.label;
                  const labelLines = splitChartLabel(point.item.label, 10);

                  return (
                    <g
                      key={point.item.label}
                      className={`property-analysis-bar-group ${isActive ? 'is-active' : ''}`}
                      style={{ '--chart-delay': `${index * 100}ms` } as CSSProperties}
                    >
                      <rect
                        className="property-analysis-bar"
                        x={point.x}
                        y={point.y}
                        width={barWidth}
                        height={point.height}
                        rx={barWidth / 2}
                        fill={point.item.color}
                      />
                      <text
                        className="property-analysis-bar-value"
                        x={point.centerX}
                        y={point.y - 8}
                        textAnchor="middle"
                      >
                        {point.item.value}
                      </text>
                      <text
                        className="property-analysis-axis-label property-analysis-axis-label--bottom"
                        x={point.centerX}
                        y={plotHeight - (labelLines.length > 1 ? 16 : 10)}
                        textAnchor="middle"
                      >
                        {labelLines.map((line, lineIndex) => (
                          <tspan
                            key={`${point.item.label}-line-${line}`}
                            x={point.centerX}
                            dy={lineIndex === 0 ? 0 : 10}
                          >
                            {line}
                          </tspan>
                        ))}
                      </text>
                    </g>
                  );
                })}

                {trendPath ? (
                  <path
                    className="property-analysis-trend"
                    d={trendPath}
                    pathLength={1}
                    style={{ stroke: activeColor }}
                  />
                ) : null}

                {arrowPath ? (
                  <path
                    className="property-analysis-trend-arrow"
                    d={arrowPath}
                    style={{ stroke: activeColor }}
                  />
                ) : null}

                {trendPoints.map((point, index) => {
                  const item = chart.items[index];
                  const isActive = item?.label === activeItem.label;

                  return (
                    <g
                      key={`point-${item?.label ?? index}`}
                      style={{ '--chart-delay': `${index * 120}ms` } as CSSProperties}
                    >
                      <circle
                        className={`property-analysis-point-ring ${isActive ? 'is-active' : ''}`}
                        cx={point.x}
                        cy={point.y}
                        r={isActive ? 8 : 6}
                        fill={hexToRgba(item?.color ?? activeColor, isActive ? 0.26 : 0.16)}
                        stroke={item?.color ?? activeColor}
                      />
                      <circle
                        className={`property-analysis-point ${isActive ? 'is-active' : ''}`}
                        cx={point.x}
                        cy={point.y}
                        r={isActive ? 4.6 : 3.8}
                        fill={item?.color ?? activeColor}
                      />
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="property-analysis-insight-stack">
              <div className="property-analysis-insight-card">
                <span>Total jobs</span>
                <strong>{chart.total}</strong>
              </div>
              <div className="property-analysis-insight-card">
                <span>Leading</span>
                <strong>{topItem?.label ?? activeItem.label}</strong>
                <small>{topItem?.value ?? activeItem.value} jobs</small>
              </div>
              <div className="property-analysis-insight-card">
                <span>Selected</span>
                <strong>{activePercent}%</strong>
                <small>{activeItem.label}</small>
              </div>
            </div>
          </div>

          <div className="property-analysis-legend-grid">
            {chart.items.map((item) => {
              const percent = chart.total ? Math.round((item.value / chart.total) * 100) : 0;
              const isActive = item.label === activeItem.label;

              return (
                <button
                  key={item.label}
                  type="button"
                  className={`property-analysis-legend ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                  style={{
                    background: `linear-gradient(180deg, ${hexToRgba(item.color, isActive ? 0.24 : 0.12)}, ${hexToRgba(item.color, isActive ? 0.12 : 0.06)})`,
                    borderColor: hexToRgba(item.color, isActive ? 0.5 : 0.28),
                  }}
                >
                  <div className="property-analysis-legend-header">
                    <span
                      className="property-chart-chip-swatch"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="property-chart-chip-label">{item.label}</span>
                    <strong>{item.value}</strong>
                  </div>
                  <span className="property-analysis-legend-bar">
                    <span
                      className="property-analysis-legend-fill"
                      style={{
                        width: `${percent}%`,
                        background: `linear-gradient(90deg, ${hexToRgba(item.color, 0.98)}, ${hexToRgba(item.color, 0.68)})`,
                      }}
                    />
                  </span>
                  <small>{percent}% share</small>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-box">No data yet for this property.</div>
      )}
    </div>
  );
}

function PropertyPaymentChartCard({
  title,
  subtitle,
  chart,
  icon = 'dollar',
}: {
  title: string;
  subtitle?: string;
  chart: PropertyDashboardChart;
  icon?: UiIconName;
}) {
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  const activeItem = chart.items.find((item) => item.label === selectedLabel) ?? chart.items[0] ?? null;
  const activePercent = activeItem && chart.total ? Math.round((activeItem.value / chart.total) * 100) : 0;
  const activeColor = activeItem?.color ?? '#87debf';
  const topItem =
    chart.items.reduce<{ label: string; value: number } | null>((current, item) => {
      if (!current || item.value > current.value) {
        return { label: item.label, value: item.value };
      }

      return current;
    }, null) ?? activeItem;
  const paymentSegments = buildPieSegments(chart.items, chart.total, activeItem?.label ?? null);
  const isSinglePaymentState = chart.items.length === 1 && activePercent === 100;

  return (
    <div className="donut-panel shell-section-card">
      {chart.items.length && activeItem ? (
        <div className="property-payment-panel">
          <div
            className="property-payment-overview"
            style={{
              background: `linear-gradient(135deg, ${hexToRgba(activeColor, 0.98)}, ${hexToRgba(activeColor, 0.7)})`,
            }}
          >
            <div className="property-payment-overview-copy">
              <h2 className="title-with-icon title-with-icon--sm">
                <UiIcon name={icon} />
                <span>{title}</span>
              </h2>
              {subtitle ? <p>{subtitle}</p> : null}
            </div>

            <div className="property-payment-overview-stat">
              <span className="property-payment-overview-badge">{activePercent}%</span>
              <div className="property-payment-overview-meta">
                <strong>{activeItem.label}</strong>
                <small>{formatJobCountLabel(activeItem.value)}</small>
              </div>
            </div>
          </div>

          <div className="property-payment-board">
            <div
              className={`property-payment-pie-shell${isSinglePaymentState ? ' property-payment-pie-shell--single' : ''}`}
              style={
                {
                  '--property-payment-ambient': chart.gradient,
                  '--property-payment-single': activeColor,
                } as CSSProperties
              }
            >
              {isSinglePaymentState ? (
                <svg
                  viewBox="0 0 340 252"
                  className="property-payment-pie-svg property-payment-pie-svg--single"
                  role="img"
                  aria-label={`${title} chart`}
                >
                  <ellipse className="property-payment-pie-shadow" cx="154" cy="198" rx="70" ry="15" />
                  <circle className="property-payment-single-orb" cx="154" cy="118" r="78" />
                  <circle className="property-payment-single-core" cx="154" cy="118" r="34" />
                  <text className="property-payment-single-percent" x="154" y="113" textAnchor="middle">
                    {activePercent}%
                  </text>
                  <text className="property-payment-single-label" x="154" y="135" textAnchor="middle">
                    {activeItem.label}
                  </text>
                </svg>
              ) : (
                <svg
                  viewBox="0 0 340 214"
                  className="property-payment-pie-svg"
                  role="img"
                  aria-label={`${title} chart`}
                >
                  <ellipse className="property-payment-pie-shadow" cx="154" cy="172" rx="62" ry="14" />
                  {paymentSegments.map((segment, index) => {
                    const isActive = segment.item.label === activeItem.label;
                    const labelLines = splitChartLabel(segment.item.label, 12);

                    return (
                      <g
                        key={segment.item.label}
                        className={`property-payment-slice-group ${isActive ? 'is-active' : ''}`}
                        style={{
                          '--slice-delay': `${index * 130}ms`,
                          '--slice-offset-x': `${segment.offsetX}px`,
                          '--slice-offset-y': `${segment.offsetY}px`,
                        } as CSSProperties}
                        onClick={() => setSelectedLabel(segment.item.label)}
                      >
                        <path
                          className="property-payment-slice"
                          d={segment.path}
                          fill={segment.item.color}
                        />
                        <path className="property-payment-leader" d={segment.leaderPath} />
                        <circle
                          className="property-payment-leader-dot"
                          cx={segment.labelDot.x}
                          cy={segment.labelDot.y}
                          r="3.5"
                          fill={segment.item.color}
                        />
                        <text
                          className="property-payment-label-percent"
                          x={segment.label.x}
                          y={segment.label.y - 4}
                          textAnchor={segment.label.anchor}
                        >
                          {segment.percent}%
                        </text>
                        <text
                          className="property-payment-label-text"
                          x={segment.label.x}
                          y={segment.label.y + 9 - (labelLines.length > 1 ? 4 : 0)}
                          textAnchor={segment.label.anchor}
                        >
                          {labelLines.map((line, lineIndex) => (
                            <tspan
                              key={`${segment.item.label}-line-${line}`}
                              x={segment.label.x}
                              dy={lineIndex === 0 ? 0 : 9}
                            >
                              {line}
                            </tspan>
                          ))}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              )}
            </div>

            <div className="property-payment-insight-stack">
              <div className="property-payment-insight-card">
                <span>Total jobs</span>
                <strong>{chart.total}</strong>
              </div>
              <div className="property-payment-insight-card">
                <span>Leading</span>
                <strong>{topItem?.label ?? activeItem.label}</strong>
                <small>{topItem?.value ?? activeItem.value} jobs</small>
              </div>
              <div className="property-payment-insight-card">
                <span>Selected</span>
                <strong>{activePercent}%</strong>
                <small>{activeItem.label}</small>
              </div>
            </div>
          </div>

          <div className="property-payment-legend-grid">
            {chart.items.map((item) => {
              const percent = chart.total ? Math.round((item.value / chart.total) * 100) : 0;
              const isActive = item.label === activeItem.label;

              return (
                <button
                  key={item.label}
                  type="button"
                  className={`property-payment-legend ${isActive ? 'is-active' : ''}`}
                  onClick={() => setSelectedLabel(item.label)}
                  style={{
                    background: `linear-gradient(180deg, ${hexToRgba(item.color, isActive ? 0.22 : 0.1)}, ${hexToRgba(item.color, isActive ? 0.12 : 0.05)})`,
                    borderColor: hexToRgba(item.color, isActive ? 0.5 : 0.28),
                  }}
                >
                  <div className="property-payment-legend-header">
                    <span className="property-payment-row-label">
                      <span className="property-payment-row-dot" style={{ backgroundColor: item.color }} />
                      {item.label}
                    </span>
                    <strong>{item.value}</strong>
                  </div>
                  <div className="property-payment-legend-track">
                    <span
                      className="property-payment-legend-fill"
                      style={{
                        width: `${percent}%`,
                        background: `linear-gradient(90deg, ${hexToRgba(item.color, 0.95)}, ${hexToRgba(item.color, 0.72)})`,
                      }}
                    />
                  </div>
                  <span className="property-payment-row-meta">{percent}% share</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="empty-box">No data yet for this property.</div>
      )}
    </div>
  );
}

function buildSmoothLinePath(points: Array<{ x: number; y: number }>) {
  if (!points.length) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const previous = points[index - 1] ?? points[index];
    const current = points[index];
    const next = points[index + 1];
    const nextNext = points[index + 2] ?? next;
    const controlPointOneX = current.x + (next.x - previous.x) / 6;
    const controlPointOneY = current.y + (next.y - previous.y) / 6;
    const controlPointTwoX = next.x - (nextNext.x - current.x) / 6;
    const controlPointTwoY = next.y - (nextNext.y - current.y) / 6;

    path += ` C ${controlPointOneX} ${controlPointOneY}, ${controlPointTwoX} ${controlPointTwoY}, ${next.x} ${next.y}`;
  }

  return path;
}

function buildArrowHeadPath(
  from: { x: number; y: number },
  to: { x: number; y: number },
  size: number,
) {
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const spread = Math.PI / 8;
  const leftX = to.x - size * Math.cos(angle - spread);
  const leftY = to.y - size * Math.sin(angle - spread);
  const rightX = to.x - size * Math.cos(angle + spread);
  const rightY = to.y - size * Math.sin(angle + spread);

  return `M ${leftX} ${leftY} L ${to.x} ${to.y} L ${rightX} ${rightY}`;
}

function buildPieSegments(
  items: PropertyDashboardChart['items'],
  total: number,
  activeLabel: string | null,
) {
  const centerX = 154;
  const centerY = 104;
  const radius = 60;
  let currentAngle = -Math.PI / 2;

  return items.map((item) => {
    const sweep = total ? (item.value / total) * Math.PI * 2 : 0;
    const startAngle = currentAngle;
    const endAngle = currentAngle + sweep;
    const midAngle = startAngle + sweep / 2;
    currentAngle = endAngle;

    const percent = total ? Math.round((item.value / total) * 100) : 0;
    const explode = item.label === activeLabel ? 7 : 0;
    const offsetX = Math.cos(midAngle) * explode;
    const offsetY = Math.sin(midAngle) * explode;
    const edgePoint = polarToCartesian(centerX, centerY, radius, midAngle);
    const elbowPoint = polarToCartesian(centerX, centerY, radius + 16, midAngle);
    const side = Math.cos(midAngle) >= 0 ? 1 : -1;
    const labelX = elbowPoint.x + side * 24;
    const labelY = elbowPoint.y;

    return {
      item,
      percent,
      path: describePieSlice(centerX, centerY, radius, startAngle, endAngle),
      offsetX,
      offsetY,
      leaderPath: `M ${edgePoint.x} ${edgePoint.y} L ${elbowPoint.x} ${elbowPoint.y} L ${labelX - side * 6} ${labelY}`,
      labelDot: { x: labelX - side * 10, y: labelY },
      label: {
        x: labelX,
        y: labelY,
        anchor: side > 0 ? ('start' as const) : ('end' as const),
      },
    };
  });
}

function describePieSlice(
  centerX: number,
  centerY: number,
  radius: number,
  startAngle: number,
  endAngle: number,
) {
  if (endAngle - startAngle >= Math.PI * 2 - 0.001) {
    const topX = centerX;
    const topY = centerY - radius;

    return `M ${centerX} ${centerY} L ${topX} ${topY} A ${radius} ${radius} 0 1 1 ${centerX - 0.01} ${topY} A ${radius} ${radius} 0 1 1 ${topX} ${topY} Z`;
  }

  const start = polarToCartesian(centerX, centerY, radius, startAngle);
  const end = polarToCartesian(centerX, centerY, radius, endAngle);
  const largeArcFlag = endAngle - startAngle > Math.PI ? 1 : 0;

  return `M ${centerX} ${centerY} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y} Z`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angle: number) {
  return {
    x: centerX + radius * Math.cos(angle),
    y: centerY + radius * Math.sin(angle),
  };
}

function splitChartLabel(label: string, maxLength: number) {
  if (label.length <= maxLength || !label.includes(' ')) {
    return [label];
  }

  const words = label.split(' ');
  const lines: string[] = [];
  let currentLine = '';

  words.forEach((word) => {
    const nextLine = currentLine ? `${currentLine} ${word}` : word;

    if (nextLine.length <= maxLength || !currentLine) {
      currentLine = nextLine;
      return;
    }

    lines.push(currentLine);
    currentLine = word;
  });

  if (currentLine) {
    lines.push(currentLine);
  }

  if (lines.length <= 2) {
    return lines;
  }

  return [lines[0], lines.slice(1).join(' ')];
}

function formatJobCountLabel(value: number) {
  return `${value} job${value === 1 ? '' : 's'}`;
}

function hexToRgba(color: string, alpha: number) {
  const raw = color.replace('#', '').trim();
  const normalized =
    raw.length === 3 ? raw.split('').map((chunk) => `${chunk}${chunk}`).join('') : raw;

  if (normalized.length !== 6) {
    return color;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}
