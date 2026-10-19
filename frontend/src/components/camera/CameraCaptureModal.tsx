import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  Camera,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  X,
  ShieldCheck,
  UserCheck,
  Clock,
  MapPin,
  Eye,
  SwitchCamera,
  FlipHorizontal,
  Lock,
  VideoOff,
} from 'lucide-react';
import { Worker, CurrentUserSession } from '../../types';
import {
  formatTime12,
  formatTime12Short,
  formatDisplayDate,
  calculateLateMinutes,
  getWorkingTimeDetails,
  calculateCheckOutMetrics,
  formatMinutesToReadable,
  applyOtThreshold,
} from '../../utils/timeCalculations';
import { DurationInput } from '../common/DurationInput';

interface CameraCaptureModalProps {
  mode: 'CHECK_IN' | 'CHECK_OUT';
  worker: Worker;
  guardSession: CurrentUserSession;
  existingCheckInTime?: string;
  existingCheckInDateTime?: string;
  calculatedLateMinutes?: number;
  submitting?: boolean;
  otMinimumMinutes?: number;
  onConfirm: (capturedPhotoDataUrl: string, calculatedLateMinutes: number, overtimeMinutesOverride?: number) => void;
  onClose: () => void;
}

// Simulated CCTV frame fallback (no physical camera). Disabled by default in production builds.
const ALLOW_SIMULATED_CAMERA = import.meta.env.VITE_ALLOW_SIMULATED_CAMERA === 'true';

type CameraPermission = 'checking' | 'prompt' | 'granted' | 'denied' | 'unsupported' | 'insecure' | 'busy' | 'notfound';

export const CameraCaptureModal: React.FC<CameraCaptureModalProps> = ({
  mode,
  worker,
  guardSession,
  existingCheckInTime,
  existingCheckInDateTime,
  calculatedLateMinutes: initialLate,
  submitting = false,
  otMinimumMinutes = 30,
  onConfirm,
  onClose,
}) => {
  // Manual OT edit at check-out (null = use system calculated OT)
  const [otEditing, setOtEditing] = useState(false);
  const [otManual, setOtManual] = useState<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [permission, setPermission] = useState<CameraPermission>('checking');

  // Camera Facing Mode: 'user' (Front) or 'environment' (Back/Rear)
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isUsingSimulatedCamera, setIsUsingSimulatedCamera] = useState<boolean>(false);
  const [hasMultipleCameras, setHasMultipleCameras] = useState<boolean>(true);
  const [capturedPhoto, setCapturedPhoto] = useState<string | null>(null);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>(formatTime12(new Date()));
  const [lateMins, setLateMins] = useState<number>(initialLate ?? 0);
  const [guardVerifiedCheckbox, setGuardVerifiedCheckbox] = useState<boolean>(true);

  const workingDetails = getWorkingTimeDetails(worker.workingTime);

  // Real-time clock update
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setCurrentTimeStr(formatTime12(now));
      if (mode === 'CHECK_IN') {
        const computed = calculateLateMinutes(now, worker.workingTime);
        setLateMins(computed);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [mode, worker.workingTime]);

  // Check available camera devices
  useEffect(() => {
    async function checkDevices() {
      try {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const videoDevices = devices.filter(d => d.kind === 'videoinput');
          if (videoDevices.length <= 1) {
            setHasMultipleCameras(false);
          } else {
            setHasMultipleCameras(true);
          }
        }
      } catch (e) {
        // Fallback: keep switch button available
        setHasMultipleCameras(true);
      }
    }
    checkDevices();
  }, []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    setStream(null);
  }, []);

  // Request & initialize camera stream with active facingMode (triggers browser permission prompt)
  const initCamera = useCallback(async () => {
    stopStream();

    if (!window.isSecureContext) {
      setPermission('insecure');
      setCameraError('Camera needs a secure connection (HTTPS or localhost).');
      setIsUsingSimulatedCamera(ALLOW_SIMULATED_CAMERA);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setPermission('unsupported');
      setCameraError('Camera device access not supported in this browser.');
      setIsUsingSimulatedCamera(ALLOW_SIMULATED_CAMERA);
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: { ideal: facingMode },
        },
        audio: false,
      });

      streamRef.current = mediaStream;
      setStream(mediaStream);
      setPermission('granted');
      setCameraError(null);
      setIsUsingSimulatedCamera(false);

      // Labels / device count only available after permission granted
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setHasMultipleCameras(devices.filter(d => d.kind === 'videoinput').length > 1);
      } catch {
        /* keep default */
      }
    } catch (err: any) {
      console.warn('Webcam stream unavailable:', err);
      const name = err?.name || '';
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setPermission('denied');
        setCameraError('Camera permission denied. Allow camera access in browser settings, then tap Retry.');
      } else if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setPermission('notfound');
        setCameraError('No camera found on this device.');
      } else if (name === 'NotReadableError' || name === 'AbortError') {
        setPermission('busy');
        setCameraError('Camera is busy (used by another app/tab). Close it and tap Retry.');
      } else {
        setPermission('denied');
        setCameraError(err?.message || 'Camera permission denied or camera device busy.');
      }
      setIsUsingSimulatedCamera(ALLOW_SIMULATED_CAMERA);
    }
  }, [facingMode, stopStream]);

  // Pre-check permission state (Chrome/Edge/Firefox); Safari falls through to getUserMedia prompt
  useEffect(() => {
    let status: PermissionStatus | null = null;
    const onChange = () => {
      if (status?.state === 'granted') initCamera();
      if (status?.state === 'denied') {
        stopStream();
        setPermission('denied');
        setCameraError('Camera permission denied. Allow camera access in browser settings, then tap Retry.');
      }
    };
    (async () => {
      try {
        status = await (navigator.permissions as any)?.query({ name: 'camera' });
        if (status) {
          if (status.state === 'denied') {
            setPermission('denied');
            setCameraError('Camera permission is blocked for this site. Allow it from the address bar / site settings, then tap Retry.');
            setIsUsingSimulatedCamera(ALLOW_SIMULATED_CAMERA);
          } else if (status.state === 'prompt') {
            setPermission('prompt');
          }
          status.addEventListener('change', onChange);
        }
      } catch {
        /* permissions API not supported for camera */
      }
    })();
    return () => status?.removeEventListener('change', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    initCamera();
    return () => stopStream();
  }, [facingMode, initCamera, stopStream]);

  // (Re)attach stream whenever the <video> is mounted (initial + after "Retake")
  useEffect(() => {
    const v = videoRef.current;
    if (v && stream && !capturedPhoto) {
      if (v.srcObject !== stream) v.srcObject = stream;
      v.play().catch(err => console.warn('Video playback warning:', err));
    }
  }, [stream, capturedPhoto]);

  const cameraReady = permission === 'granted' && !!stream;
  const canCapture = cameraReady || isUsingSimulatedCamera;

  // Switch between Front & Back Camera
  const handleToggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  /**
   * CRITICAL REQUIREMENT 2:
   * DATE & TIME + WORKER INFO MUST BE PERMANENTLY STAMPED ONTO THE CAPTURED PHOTO CANVAS
   * 
   * Example:
   * Rahul Kumar
   * EMP-001
   * CHECK-IN
   * 08 Oct 2026 | 09:12:35 AM
   */
  const handleCapturePhoto = () => {
    if (!canCapture) return;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = 1280;
    canvas.height = 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const now = new Date();
    const dateFormatted = formatDisplayDate(now);
    const timeFormatted = formatTime12(now);
    const modeLabel = mode === 'CHECK_IN' ? 'CHECK-IN' : 'CHECK-OUT';

    if (!isUsingSimulatedCamera && !cameraError && videoRef.current && videoRef.current.videoWidth > 0) {
      const video = videoRef.current;
      // Draw video frame onto canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    } else {
      // High-resolution realistic gate CCTV canvas frame for simulated environments
      drawSimulatedFrame(ctx, canvas.width, canvas.height);
    }

    // DRAW PERMANENT INDUSTRIAL TIMESTAMP & WORKER WATERMARK OVERLAY
    const bannerHeight = 110;
    const yTop = canvas.height - bannerHeight;

    // Dark semi-transparent background with border for maximum contrast & visibility
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(0, yTop, canvas.width, bannerHeight);

    // Accent line at top of banner
    ctx.fillStyle = mode === 'CHECK_IN' ? '#10b981' : '#38bdf8';
    ctx.fillRect(0, yTop, canvas.width, 5);

    // Left block: Worker Name, Employee ID, Attendance Type
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${worker.fullName}`, 24, yTop + 38);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${worker.employeeId}`, 24, yTop + 68);

    ctx.font = 'bold 16px sans-serif';
    ctx.fillStyle = mode === 'CHECK_IN' ? '#34d399' : '#60a5fa';
    ctx.fillText(`• ${modeLabel}`, 150, yTop + 68);

    ctx.font = '14px sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`Working Time: ${worker.workingTime}`, 24, yTop + 95);

    // Right block: EXACT STAMPED DATE & TIME + GUARD AUDIT
    ctx.textAlign = 'right';
    ctx.fillStyle = '#f59e0b'; // Amber bold timestamp
    ctx.font = 'bold 26px monospace';
    ctx.fillText(`${dateFormatted} | ${timeFormatted}`, canvas.width - 24, yTop + 40);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '15px sans-serif';
    ctx.fillText(
      `Marked By: ${guardSession.name} (${guardSession.guardCode || (guardSession.role === 'ADMIN' ? 'Admin' : 'Guard')}) • ${guardSession.gate || 'Gate 1'}`,
      canvas.width - 24,
      yTop + 70
    );

    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(
      `${isUsingSimulatedCamera ? 'SIMULATED FRAME (NO CAMERA)' : 'VERIFIED GATE CCTV SNAPSHOT'} • FACING: ${facingMode.toUpperCase()}`,
      canvas.width - 24,
      yTop + 95
    );

    const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
    setCapturedPhoto(dataUrl);
  };

  const drawSimulatedFrame = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Industrial Gate CCTV Background
    const grad = ctx.createLinearGradient(0, 0, 0, height);
    grad.addColorStop(0, '#1e293b');
    grad.addColorStop(0.5, '#0f172a');
    grad.addColorStop(1, '#020617');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // Security Gate Grid overlay
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let x = 0; x < width; x += 60) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y < height; y += 60) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Centered Badge representation
    const cx = width / 2;
    const cy = height / 2 - 40;
    ctx.beginPath();
    ctx.arc(cx, cy, 110, 0, Math.PI * 2);
    ctx.fillStyle = '#0284c7';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#38bdf8';
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 72px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(worker.fullName.charAt(0), cx, cy + 26);

    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(worker.fullName, cx, cy + 160);

    ctx.font = 'bold 18px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`${worker.employeeId} • ${worker.department}`, cx, cy + 195);
  };

  const handleRetake = () => {
    setCapturedPhoto(null);
  };

  const handleConfirmAction = () => {
    if (submitting) return;
    if (!capturedPhoto) {
      handleCapturePhoto();
      return;
    }
    onConfirm(capturedPhoto, lateMins, mode === 'CHECK_OUT' && otManual !== null ? otManual : undefined);
  };

  // Check-Out OT calculation preview
  const checkOutMetrics = React.useMemo(() => {
    if (mode !== 'CHECK_OUT') return null;
    const now = new Date();
    const checkInDate = existingCheckInDateTime ? new Date(existingCheckInDateTime) : new Date();
    const m = calculateCheckOutMetrics(checkInDate, now, worker.workingTime);
    // OT only counts if exit >= otMinimumMinutes after duty end
    return { ...m, rawOvertimeMinutes: m.overtimeMinutes, overtimeMinutes: applyOtThreshold(m.overtimeMinutes, otMinimumMinutes) };
    // recompute every second with clock
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, existingCheckInDateTime, worker.workingTime, currentTimeStr, otMinimumMinutes]);

  const finalOt = otManual !== null ? otManual : checkOutMetrics?.overtimeMinutes ?? 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/85 backdrop-blur-sm p-0 sm:p-4 overflow-y-auto">
      <div className="bg-slate-900 border-0 sm:border-2 border-slate-700 w-full max-w-4xl min-h-full sm:min-h-0 sm:rounded-2xl shadow-2xl overflow-hidden text-white sm:my-auto">
        
        {/* Terminal Header */}
        <div className="sticky top-0 z-10 bg-slate-800 border-b border-slate-700 px-4 sm:px-6 py-3 sm:py-4 flex items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${mode === 'CHECK_IN' ? 'bg-emerald-600/30 text-emerald-400 border border-emerald-500/40' : 'bg-blue-600/30 text-blue-400 border border-blue-500/40'}`}>
              <Camera className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-700 text-slate-300">
                  {guardSession.gate || 'Gate 1 – Main Gate'}
                </span>
                <span className="text-xs text-emerald-400 flex items-center gap-1 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                  LIVE CAMERA VERIFICATION
                </span>
              </div>
              <h2 className="text-base sm:text-xl font-bold tracking-tight text-white mt-0.5">
                {mode === 'CHECK_IN' ? 'Worker Gate Check-In & Photo Proof' : 'Worker Gate Check-Out Verification'}
              </h2>
            </div>
          </div>

          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-700/60 transition-colors cursor-pointer"
            title="Cancel"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">

          {/* SIDE-BY-SIDE PHOTO VERIFICATION PANEL */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* LEFT: Registered Worker Master Photo */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between">
              <div className="w-full flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-sky-400" /> Registered Profile Photo
                </span>
                <span className="text-xs bg-sky-950 text-sky-300 px-2 py-0.5 rounded border border-sky-800 font-mono">
                  MASTER RECORD
                </span>
              </div>

              <div className="relative w-36 h-36 sm:w-48 sm:h-48 md:w-56 md:h-56 rounded-xl overflow-hidden border-2 border-sky-500/30 shadow-inner bg-slate-900 flex items-center justify-center">
                <img
                  src={worker.profilePhoto}
                  alt={worker.fullName}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-2 left-2 right-2 bg-black/75 backdrop-blur-sm px-2 py-1 rounded text-center">
                  <p className="text-xs font-semibold text-white truncate">{worker.fullName}</p>
                  <p className="text-[11px] text-slate-300 font-mono">{worker.employeeId}</p>
                </div>
              </div>

              <div className="w-full mt-3 bg-slate-900/90 rounded-lg p-2.5 text-xs text-slate-300 space-y-1 border border-slate-800">
                <div className="flex justify-between">
                  <span className="text-slate-400">Department:</span>
                  <span className="font-semibold text-white">{worker.department}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Working Time:</span>
                  <span className="font-medium text-emerald-400 font-mono">{worker.workingTime}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Normal End:</span>
                  <span className="font-medium text-amber-400 font-mono">{workingDetails.endTime12}</span>
                </div>
              </div>
            </div>

            {/* RIGHT: Live Camera / Captured Live Photo with FRONT & BACK SWITCH BUTTON */}
            <div className="bg-slate-950/70 border border-slate-800 rounded-xl p-4 flex flex-col items-center justify-between">
              <div className="w-full flex items-center justify-between pb-2 border-b border-slate-800 mb-3">
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-400" /> Gate Camera Preview
                </span>

                {/* VISIBLE SWITCH CAMERA BUTTON (Front ↔ Back) */}
                <div className="flex items-center gap-2">
                  {!capturedPhoto && cameraReady && hasMultipleCameras && (
                    <button
                      type="button"
                      onClick={handleToggleCamera}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-sky-400 hover:text-sky-300 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                      title="Switch between Front and Back camera"
                    >
                      <SwitchCamera className="w-3.5 h-3.5" />
                      <span>{facingMode === 'user' ? 'Switch to Back' : 'Switch to Front'}</span>
                    </button>
                  )}

                  <span className={`text-xs px-2 py-0.5 rounded font-mono ${capturedPhoto ? 'bg-emerald-950 text-emerald-300 border border-emerald-800' : 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'}`}>
                    {capturedPhoto ? 'STAMPED PHOTO' : `${facingMode.toUpperCase()} CAM`}
                  </span>
                </div>
              </div>

              <div className="camera-surface relative w-full aspect-[4/3] sm:aspect-auto sm:h-56 rounded-xl overflow-hidden border-2 border-emerald-500/40 bg-black flex items-center justify-center">
                {capturedPhoto ? (
                  <img
                    src={capturedPhoto}
                    alt="Captured Live Photo with Timestamp"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${cameraReady ? 'block' : 'hidden'} ${facingMode === 'user' ? '-scale-x-100' : ''}`}
                    />
                    {!cameraReady && (
                      <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-4 text-center bg-black">
                        {permission === 'checking' || permission === 'prompt' ? (
                          <>
                            <Camera className="w-10 h-10 text-emerald-400 mb-2 animate-pulse" />
                            <p className="text-sm font-semibold text-white">Camera Permission Required</p>
                            <p className="text-xs text-slate-300 mt-1 max-w-xs">
                              Tap <strong>Allow</strong> on the browser prompt to open the gate camera.
                            </p>
                            <button
                              type="button"
                              onClick={initCamera}
                              className="mt-3 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <Camera className="w-4 h-4" /> Allow Camera Access
                            </button>
                          </>
                        ) : (
                          <>
                            {permission === 'insecure' ? (
                              <Lock className="w-10 h-10 text-amber-400 mb-2" />
                            ) : (
                              <VideoOff className="w-10 h-10 text-rose-400 mb-2" />
                            )}
                            <p className="text-sm font-semibold text-white">
                              {permission === 'insecure'
                                ? 'HTTPS Required for Camera'
                                : permission === 'notfound'
                                ? 'No Camera Detected'
                                : permission === 'busy'
                                ? 'Camera Busy'
                                : permission === 'unsupported'
                                ? 'Camera Not Supported'
                                : 'Camera Access Blocked'}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 max-w-xs">{cameraError}</p>
                            {permission === 'denied' && (
                              <p className="text-[11px] text-slate-400 mt-1 max-w-xs">
                                Tap the 🔒 lock icon in the address bar → Site settings → Camera → Allow.
                              </p>
                            )}
                            <button
                              type="button"
                              onClick={initCamera}
                              className="mt-3 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                            >
                              <RefreshCw className="w-4 h-4" /> Retry Camera
                            </button>
                            {isUsingSimulatedCamera && (
                              <p className="text-[10px] text-amber-300 mt-2">Simulated frame capture enabled (demo mode).</p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                    {/* Viewfinder crosshairs */}
                    <div className="absolute inset-4 border border-dashed border-emerald-500/30 rounded-lg pointer-events-none flex items-center justify-center">
                      <div className="w-16 h-16 border-t-2 border-l-2 border-emerald-400 absolute top-0 left-0"></div>
                      <div className="w-16 h-16 border-t-2 border-r-2 border-emerald-400 absolute top-0 right-0"></div>
                      <div className="w-16 h-16 border-b-2 border-l-2 border-emerald-400 absolute bottom-0 left-0"></div>
                      <div className="w-16 h-16 border-b-2 border-r-2 border-emerald-400 absolute bottom-0 right-0"></div>
                      <span className="text-[11px] text-emerald-300/80 bg-black/60 px-2 py-0.5 rounded">
                        Position Worker Face
                      </span>
                    </div>

                    {/* Camera Mode Overlay Badge */}
                    <div className="absolute top-2 left-2 bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded text-[10px] text-slate-300 font-mono">
                      {facingMode === 'user' ? 'Front Camera' : 'Back / Rear Camera'}
                    </div>
                  </>
                )}
              </div>

              {/* Camera Action Buttons */}
              <div className="w-full mt-3 flex items-center gap-2">
                {!capturedPhoto ? (
                  <button
                    type="button"
                    onClick={handleCapturePhoto}
                    disabled={!canCapture}
                    className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold rounded-lg flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-sm">Capture Live Photo (Stamp Timestamp)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRetake}
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-lg flex items-center justify-center gap-2 border border-slate-700 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-4 h-4" />
                    <span>Retake Photo</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* VERIFICATION & AUTOMATIC CALCULATIONS SUMMARY */}
          <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-emerald-400" /> Attendance Calculation & Guard Audit Proof
            </h3>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Worker Name</span>
                <span className="font-bold text-white text-base truncate block">{worker.fullName}</span>
                <span className="text-xs font-mono text-slate-400">{worker.employeeId}</span>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Assigned Working Time</span>
                <span className="font-semibold text-white font-mono text-xs">{worker.workingTime}</span>
                <span className="text-[11px] text-slate-400 block mt-0.5">Start: 09:00 AM • End: {workingDetails.endTime12}</span>
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">
                  {mode === 'CHECK_IN' ? 'Actual Check-In' : 'Actual Check-Out'}
                </span>
                <span className="font-mono font-bold text-lg text-amber-400 block">{currentTimeStr}</span>
                {mode === 'CHECK_OUT' && existingCheckInTime && (
                  <span className="text-xs text-slate-400">Checked In: {existingCheckInTime}</span>
                )}
              </div>

              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800/80">
                <span className="text-xs text-slate-400 block">Calculated Status</span>
                {mode === 'CHECK_IN' ? (
                  lateMins > 0 ? (
                    <span className="text-rose-400 font-bold flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Late: {formatMinutesToReadable(lateMins)}
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> On-Time (Present)
                    </span>
                  )
                ) : (
                  <div>
                    {finalOt > 0 ? (
                      <span className="text-amber-400 font-bold block">
                        +{formatMinutesToReadable(finalOt)} OT{otManual !== null ? ' (edited)' : ''}
                      </span>
                    ) : checkOutMetrics && checkOutMetrics.rawOvertimeMinutes > 0 ? (
                      <span className="text-emerald-400 font-bold block">
                        No OT
                        <span className="block text-[10px] font-normal text-slate-400">
                          Left {formatMinutesToReadable(checkOutMetrics.rawOvertimeMinutes)} after duty (below {formatMinutesToReadable(otMinimumMinutes)})
                        </span>
                      </span>
                    ) : checkOutMetrics && checkOutMetrics.earlyExitMinutes > 0 ? (
                      <span className="text-rose-400 font-bold block">
                        -{formatMinutesToReadable(checkOutMetrics.earlyExitMinutes)} Early Exit
                      </span>
                    ) : (
                      <span className="text-emerald-400 font-bold block">Normal Shift Exit</span>
                    )}
                    <span className="text-[10px] text-slate-400 font-mono">
                      Duty End: {workingDetails.endTime12}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* OVERTIME REVIEW / CUSTOM EDIT (check-out only) */}
            {mode === 'CHECK_OUT' && (
              <div className="mt-3 p-3 rounded-lg border border-amber-800/60 bg-amber-950/30 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs">
                    <span className="font-semibold text-amber-300">Overtime (OT)</span>
                    <span className="text-slate-400">
                      {' '}
                      • System: {formatMinutesToReadable(checkOutMetrics?.overtimeMinutes ?? 0)} • OT starts only if exit ≥{' '}
                      {formatMinutesToReadable(otMinimumMinutes)} after {workingDetails.endTime12}
                    </span>
                  </div>
                  {!otEditing ? (
                    <button
                      type="button"
                      onClick={() => {
                        setOtEditing(true);
                        setOtManual(checkOutMetrics?.overtimeMinutes ?? 0);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-amber-600 hover:bg-amber-500 text-white cursor-pointer"
                    >
                      Edit OT
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setOtEditing(false);
                        setOtManual(null);
                      }}
                      className="px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
                    >
                      Use System OT
                    </button>
                  )}
                </div>
                {otEditing && (
                  <div className="max-w-xs">
                    <DurationInput value={otManual ?? 0} onChange={setOtManual} accent="amber" />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Custom OT will be saved: <strong className="text-amber-300">{formatMinutesToReadable(otManual ?? 0)}</strong> (logged in audit trail)
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Guard Accountability Badge */}
            <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Marked By: <strong className="text-white">{guardSession.name}</strong> ({guardSession.guardCode || (guardSession.role === 'ADMIN' ? 'Admin' : 'Guard')})</span>
                <span className="text-slate-500">•</span>
                <span className="flex items-center gap-1 text-slate-400">
                  <MapPin className="w-3.5 h-3.5 text-amber-400" /> {guardSession.gate || 'Gate 1'}
                </span>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none text-slate-300 hover:text-white">
                <input
                  type="checkbox"
                  checked={guardVerifiedCheckbox}
                  onChange={e => setGuardVerifiedCheckbox(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500"
                />
                <span>I confirm person at gate matches registered photo</span>
              </label>
            </div>
          </div>

        </div>

        {/* Modal Footer Actions */}
        <div className="sticky bottom-0 bg-slate-800 border-t border-slate-700 px-4 sm:px-6 py-3 sm:py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-slate-400 text-center sm:text-left">
            * Final photo permanently embeds worker name, employee ID, gate date & time.
          </p>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700/60 transition-colors font-medium cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={handleConfirmAction}
              disabled={!guardVerifiedCheckbox || submitting || (!capturedPhoto && !canCapture)}
              className={`flex-1 sm:flex-none px-5 sm:px-7 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 shadow-lg transition-all cursor-pointer disabled:cursor-not-allowed ${
                guardVerifiedCheckbox && !submitting && (capturedPhoto || canCapture)
                  ? mode === 'CHECK_IN'
                    ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950 active:scale-95'
                    : 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-950 active:scale-95'
                  : 'bg-slate-700 text-slate-500 cursor-not-allowed'
              }`}
            >
              {submitting ? (
                <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <CheckCircle2 className="w-5 h-5" />
              )}
              <span>
                {submitting
                  ? 'SAVING...'
                  : !capturedPhoto
                  ? 'CAPTURE & REVIEW'
                  : mode === 'CHECK_IN'
                  ? 'CONFIRM CHECK-IN'
                  : 'CONFIRM CHECK-OUT'}
              </span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
