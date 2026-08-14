import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Camera, ChevronLeft, ChevronRight, ImageIcon, Plus, Trash2 } from "lucide-react";
import {
  deleteProgressPhoto,
  fetchBodyProgressPhotos,
  photoContentUrl,
  reorderProgressPhotos,
  UnauthenticatedError,
  uploadProgressPhotos,
} from "../api";
import { useAuth } from "../context";
import type { BodyProgressPhoto, BodyProgressPhotoPage } from "../types";
import Page from "../layouts/Page";
import { AppHeader } from "../layouts/AppShell";
import Button from "../ui/Button";
import IconButton from "../ui/IconButton";
import Alert from "../ui/Alert";
import Dialog from "../ui/Dialog";
import BottomSheet from "../ui/BottomSheet";
import EmptyState from "../ui/EmptyState";
import Section from "../ui/Section";
import styles from "./BodyWeightPhotosScreen.module.css";

const MAX_FILE_BYTES = 15 * 1024 * 1024;

const ACCEPT_HINT =
  "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const SUPPORTED_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

interface DraftPhoto {
  id: string;
  file: File;
  previewUrl: string;
  error: string | null;
}

function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatKg(value: number): string {
  return `${Number(value.toFixed(1))} kg`;
}

function isSupportedFile(file: File): boolean {
  return SUPPORTED_MIME_TYPES.has(file.type) || /\.(jpe?g|png|webp|heic|heif)$/i.test(file.name);
}

export default function BodyWeightPhotosScreen() {
  const { measurementDate = "" } = useParams();
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [page, setPage] = useState<BodyProgressPhotoPage | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [initialError, setInitialError] = useState<string | null>(null);

  const [draft, setDraft] = useState<DraftPhoto[]>([]);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [uploadPending, setUploadPending] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [selectedIndex, setSelectedIndex] = useState(0);
  const [contentError, setContentError] = useState(false);
  const [contentNonce, setContentNonce] = useState(0);

  const [deleteTarget, setDeleteTarget] = useState<BodyProgressPhoto | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [reorderPending, setReorderPending] = useState(false);
  const [reorderError, setReorderError] = useState<string | null>(null);
  const lastMove = useRef<{ index: number; direction: -1 | 1 } | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const draftStatusRef = useRef<HTMLDivElement>(null);

  const requestSequence = useRef(0);

  const load = useCallback(async () => {
    const requestId = ++requestSequence.current;
    setPage(null);
    setNotFound(false);
    setInitialError(null);
    setContentError(false);
    try {
      const result = await fetchBodyProgressPhotos(measurementDate);
      if (requestId !== requestSequence.current) return;
      if ("notFound" in result) {
        setNotFound(true);
        return;
      }
      setPage(result);
      setSelectedIndex(0);
      setReorderError(null);
      setDeleteError(null);
      lastMove.current = null;
    } catch (err) {
      if (requestId !== requestSequence.current) return;
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setInitialError("Unable to load progress photos. Please try again.");
    }
  }, [measurementDate, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  const revokeDraftUrls = useCallback((items: DraftPhoto[]) => {
    for (const item of items) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }, []);

  const draftUrlsRef = useRef<DraftPhoto[]>([]);
  draftUrlsRef.current = draft;

  useEffect(() => {
    return () => {
      revokeDraftUrls(draftUrlsRef.current);
    };
  }, [revokeDraftUrls]);

  const remainingCapacity = page === null ? 0 : page.remaining_capacity;
  const storedCount = page?.photos.length ?? 0;

  const backToBodyWeight = useCallback(() => {
    navigate("/progress/body-weight");
  }, [navigate]);

  const openSheet = () => {
    setSheetOpen(true);
    setUploadError(null);
  };

  const validateFiles = (files: File[]): DraftPhoto[] => {
    return files.map((file) => {
      let error: string | null = null;
      if (!isSupportedFile(file)) {
        error = "This file is not a supported image.";
      } else if (file.size > MAX_FILE_BYTES) {
        error = "This image is larger than 15 MiB.";
      }
      return { id: crypto.randomUUID(), file, previewUrl: URL.createObjectURL(file), error };
    });
  };

  const addFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (files.length > remainingCapacity) {
        setUploadError(
          `You can add ${remainingCapacity === 1 ? "1 more photo" : `${remainingCapacity} more photos`}.`,
        );
        return;
      }
      const newItems = validateFiles(files);
      setDraft((prev) => [...prev, ...newItems]);
      setUploadError(null);
      requestAnimationFrame(() => draftStatusRef.current?.focus());
    },
    [remainingCapacity],
  );

  const handleCameraChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) addFiles(Array.from(files));
    event.target.value = "";
  };

  const handleGalleryChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (files) addFiles(Array.from(files));
    event.target.value = "";
  };

  const removeDraft = (id: string) => {
    setDraft((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((item) => item.id !== id);
    });
  };

  const moveDraft = (id: string, direction: -1 | 1) => {
    setDraft((prev) => {
      const index = prev.findIndex((item) => item.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const clearDraft = useCallback(() => {
    setDraft((prev) => {
      revokeDraftUrls(prev);
      return [];
    });
  }, [revokeDraftUrls]);

  const draftHasErrors = draft.some((item) => item.error !== null);
  const canUpload = draft.length > 0 && !draftHasErrors && !uploadPending;

  const handleUpload = async () => {
    if (!canUpload || page === null) return;
    setUploadError(null);
    setUploadPending(true);
    try {
      const result = await uploadProgressPhotos(
        measurementDate,
        draft.map((item) => item.file),
      );
      if ("detail" in result) {
        setUploadError(result.detail);
        return;
      }
      clearDraft();
      setPage(result);
      setSelectedIndex(storedCount);
      setContentError(false);
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setUploadError("Unable to upload photos. Please try again.");
    } finally {
      setUploadPending(false);
    }
  };

  const handleCancelDraft = () => {
    clearDraft();
    setUploadError(null);
  };

  const handleMoveStored = async (index: number, direction: -1 | 1) => {
    if (page === null || reorderPending) return;
    const target = index + direction;
    if (target < 0 || target >= page.photos.length) return;
    lastMove.current = { index, direction };
    setReorderError(null);
    setReorderPending(true);
    try {
      const newPhotos = [...page.photos];
      [newPhotos[index], newPhotos[target]] = [newPhotos[target], newPhotos[index]];
      const result = await reorderProgressPhotos(
        measurementDate,
        newPhotos.map((photo) => photo.id),
      );
      if ("detail" in result) {
        setReorderError(result.detail);
        return;
      }
      setPage(result);
      setSelectedIndex(target);
      lastMove.current = null;
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setReorderError("Unable to save order. Please try again.");
    } finally {
      setReorderPending(false);
    }
  };

  const retryMove = () => {
    const move = lastMove.current;
    if (move) void handleMoveStored(move.index, move.direction);
  };

  const openDelete = (photo: BodyProgressPhoto) => {
    setDeleteTarget(photo);
    setDeleteError(null);
    setReorderError(null);
    lastMove.current = null;
  };

  const handleDelete = async () => {
    if (deleteTarget === null || deletePending) return;
    setDeleteError(null);
    setDeletePending(true);
    try {
      const result = await deleteProgressPhoto(deleteTarget.id);
      if (result !== null) {
        setDeleteError(result.detail);
        return;
      }
      setDeleteTarget(null);
      setReorderError(null);
      lastMove.current = null;
      await load();
    } catch (err) {
      if (err instanceof UnauthenticatedError) {
        logout();
        return;
      }
      setDeleteError("Unable to delete photo. Please try again.");
    } finally {
      setDeletePending(false);
    }
  };

  const photos = page?.photos ?? [];
  const selectedPhoto = photos[selectedIndex] ?? null;
  const showLoading = page === null && !notFound && !initialError;

  const uploadUnavailable = page !== null && page.remaining_capacity === 0;

  return (
    <>
      <AppHeader title="Body progress photos" showBack onBack={backToBodyWeight} />
      <Page width="reading">
        {notFound && (
          <EmptyState
            icon={<ImageIcon size={32} />}
            title="Measurement not found"
            description="This body-weight measurement does not exist or is no longer available."
            action={
              <Button variant="secondary" onClick={backToBodyWeight}>
                Back to body weight
              </Button>
            }
          />
        )}

        {initialError && (
          <Alert variant="error">
            <div className={styles.stack2}>
              <span>{initialError}</span>
              <Button variant="secondary" size="small" onClick={load}>
                Retry
              </Button>
            </div>
          </Alert>
        )}

        {page !== null && (
          <>
            <div className={styles.contextBlock}>
              <p className={styles.contextDate}>{formatLongDate(measurementDate)}</p>
              <p className={styles.contextWeight}>{formatKg(page.measurement.weight_kg)}</p>
              <p className={styles.guidance}>
                Recommended views are front, side, and back, but you can add any photos you like.
              </p>
            </div>

            {showLoading && (
              <div className={styles.viewerSkeleton} aria-label="Loading progress photos" />
            )}

            {storedCount === 0 && (
              <EmptyState
                icon={<ImageIcon size={32} />}
                title="No progress photos for this measurement"
                description="Add up to five private photos to track your body over time."
              />
            )}

            {selectedPhoto !== null && (
              <Section title="Photos">
                <div className={styles.viewer}>
                  {contentError ? (
                    <div className={styles.contentError}>
                      <p>Unable to load this private photo. Please try again.</p>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setContentError(false);
                          setContentNonce((n) => n + 1);
                        }}
                      >
                        Retry
                      </Button>
                    </div>
                  ) : (
                    <img
                      key={`${selectedPhoto.id}-${contentNonce}`}
                      src={photoContentUrl(selectedPhoto.content_path)}
                      alt={`Body progress photo ${selectedIndex + 1} of ${storedCount} for ${formatLongDate(measurementDate)}`}
                      className={styles.viewerImage}
                      onError={() => setContentError(true)}
                    />
                  )}

                  {storedCount > 1 && (
                    <div className={styles.viewerControls}>
                      <IconButton
                        label="Previous photo"
                        onClick={() => {
                          setContentError(false);
                          setSelectedIndex((selectedIndex - 1 + storedCount) % storedCount);
                        }}
                        disabled={reorderPending}
                      >
                        <ChevronLeft size={20} aria-hidden="true" />
                      </IconButton>
                      <span className={styles.viewerPosition}>
                        {selectedIndex + 1} of {storedCount}
                      </span>
                      <IconButton
                        label="Next photo"
                        onClick={() => {
                          setContentError(false);
                          setSelectedIndex((selectedIndex + 1) % storedCount);
                        }}
                        disabled={reorderPending}
                      >
                        <ChevronRight size={20} aria-hidden="true" />
                      </IconButton>
                    </div>
                  )}

                  <div className={styles.reorderRow}>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => void handleMoveStored(selectedIndex, -1)}
                      disabled={selectedIndex === 0 || reorderPending}
                    >
                      {reorderPending ? "Saving order…" : "Move previous"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => void handleMoveStored(selectedIndex, 1)}
                      disabled={selectedIndex === storedCount - 1 || reorderPending}
                    >
                      {reorderPending ? "Saving order…" : "Move next"}
                    </Button>
                    <Button
                      variant="ghost"
                      size="small"
                      onClick={() => openDelete(selectedPhoto)}
                      disabled={reorderPending}
                    >
                      Delete
                    </Button>
                  </div>

                  {reorderError && (
                    <Alert variant="error">
                      <div className={styles.stack2}>
                        <span>{reorderError}</span>
                        <Button variant="secondary" size="small" onClick={retryMove}>
                          Retry
                        </Button>
                      </div>
                    </Alert>
                  )}

                  {storedCount > 1 && (
                    <div className={styles.thumbnails} role="group" aria-label="Photo thumbnails">
                      {photos.map((photo, index) => (
                        <button
                          key={photo.id}
                          type="button"
                          className={`${styles.thumbnail} ${index === selectedIndex ? styles.thumbnailActive : ""}`}
                          onClick={() => {
                            setContentError(false);
                            setSelectedIndex(index);
                          }}
                          aria-label={`View photo ${index + 1}`}
                          aria-current={index === selectedIndex ? "true" : undefined}
                        >
                          <img
                            src={photoContentUrl(photo.content_path)}
                            alt=""
                            aria-hidden="true"
                            className={styles.thumbnailImage}
                          />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </Section>
            )}

            <Section title="Add photos" className={styles.uploadSection}>
              {uploadUnavailable && <p className={styles.capacityText}>5 of 5 photos</p>}

              {draft.length === 0 && !uploadUnavailable && (
                <Button variant="primary" fullWidth onClick={openSheet}>
                  <Plus size={18} aria-hidden="true" />
                  Add photos
                </Button>
              )}

              {draft.length > 0 && (
                <div className={styles.draftBlock}>
                  <div ref={draftStatusRef} tabIndex={-1} className={styles.draftStatus}>
                    {draft.length} photo{draft.length === 1 ? "" : "s"} selected ·{" "}
                    {remainingCapacity - draft.length}{" "}
                    {remainingCapacity - draft.length === 1 ? "space" : "spaces"} remaining
                  </div>

                  <div className={styles.draftList}>
                    {draft.map((item, index) => (
                      <div key={item.id} className={styles.draftRow}>
                        <img
                          src={item.previewUrl}
                          alt=""
                          aria-hidden="true"
                          className={styles.draftPreview}
                        />
                        <div className={styles.draftInfo}>
                          <span className={styles.draftName}>{item.file.name}</span>
                          {item.error && <span className={styles.draftError}>{item.error}</span>}
                        </div>
                        <div className={styles.draftActions}>
                          <IconButton
                            label="Move photo earlier"
                            onClick={() => moveDraft(item.id, -1)}
                            disabled={index === 0 || uploadPending}
                          >
                            <ChevronLeft size={18} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label="Move photo later"
                            onClick={() => moveDraft(item.id, 1)}
                            disabled={index === draft.length - 1 || uploadPending}
                          >
                            <ChevronRight size={18} aria-hidden="true" />
                          </IconButton>
                          <IconButton
                            label={`Remove ${item.file.name}`}
                            onClick={() => removeDraft(item.id)}
                            disabled={uploadPending}
                          >
                            <Trash2 size={18} aria-hidden="true" />
                          </IconButton>
                        </div>
                      </div>
                    ))}
                  </div>

                  {uploadError && <Alert variant="error">{uploadError}</Alert>}

                  <div className={styles.draftButtons}>
                    <Button
                      variant="primary"
                      fullWidth
                      onClick={handleUpload}
                      disabled={!canUpload}
                    >
                      {uploadPending ? "Uploading…" : "Upload photos"}
                    </Button>
                    <div className={styles.draftSecondary}>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => {
                          setSheetOpen(true);
                        }}
                        disabled={uploadPending || remainingCapacity - draft.length <= 0}
                      >
                        <Camera size={16} aria-hidden="true" />
                        Take another photo
                      </Button>
                      <Button
                        variant="secondary"
                        size="small"
                        onClick={() => galleryInputRef.current?.click()}
                        disabled={uploadPending || remainingCapacity - draft.length <= 0}
                      >
                        Choose more
                      </Button>
                      <Button
                        variant="ghost"
                        size="small"
                        onClick={handleCancelDraft}
                        disabled={uploadPending}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Section>
          </>
        )}

        <input
          ref={cameraInputRef}
          type="file"
          accept={ACCEPT_HINT}
          capture="environment"
          className={styles.hiddenInput}
          onChange={handleCameraChange}
          tabIndex={-1}
          aria-hidden="true"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept={ACCEPT_HINT}
          multiple
          className={styles.hiddenInput}
          onChange={handleGalleryChange}
          tabIndex={-1}
          aria-hidden="true"
        />
      </Page>

      <BottomSheet open={sheetOpen} title="Add photos" onClose={() => setSheetOpen(false)}>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setSheetOpen(false);
            cameraInputRef.current?.click();
          }}
        >
          <Camera size={18} aria-hidden="true" />
          Take a photo
        </Button>
        <Button
          variant="secondary"
          fullWidth
          onClick={() => {
            setSheetOpen(false);
            galleryInputRef.current?.click();
          }}
        >
          <ImageIcon size={18} aria-hidden="true" />
          Choose from device
        </Button>
        <Button variant="ghost" fullWidth onClick={() => setSheetOpen(false)}>
          Cancel
        </Button>
      </BottomSheet>

      <Dialog
        open={deleteTarget !== null}
        title="Delete photo"
        onClose={deletePending ? () => {} : () => setDeleteTarget(null)}
        actions={
          <>
            <Button
              variant="secondary"
              onClick={() => setDeleteTarget(null)}
              disabled={deletePending}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={handleDelete} disabled={deletePending}>
              {deletePending ? "Deleting…" : "Delete photo"}
            </Button>
          </>
        }
      >
        <p>
          Delete photo {deleteTarget ? `${deleteTarget.display_order + 1} of ${storedCount}` : ""}{" "}
          for {formatLongDate(measurementDate)}? It will be permanently removed.
        </p>
        {deleteError && <Alert variant="error">{deleteError}</Alert>}
      </Dialog>
    </>
  );
}
