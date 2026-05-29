/**
 * app.js — Core Frontend Logic
 *
 * Handles:
 *  - Map initialization and complaint loading
 *  - Report form open/close/drag
 *  - Live camera capture
 *  - Complaint form submission with Gemini rejection message support
 *  - Offline detection and localStorage save
 *  - AI Chatbot widget
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("🚀 RoadWatch booting...");

    // Track whether the user is in "tap to place pin" mode
    let isMarkingMode = false;

    // Holds the active camera MediaStream so we can stop it cleanly
    let localStream = null;

    // Detect which page we're on — admin.html contains "admin" in its path
    const isAdmin = window.location.pathname.includes('admin');

    // Pick the correct map div id based on which page we're on
    const mapElementId = isAdmin ? 'admin-map' : 'map';

    // ==========================================================
    // 1. MAP INITIALIZATION
    // ==========================================================
    try {
        if (typeof MapManager !== 'undefined') {
            MapManager.init(mapElementId);
        }
    } catch (e) {
        console.error("❌ MapManager init failed:", e);
    }

    // ==========================================================
    // 2. GPS LOCATION (citizen page only)
    // ==========================================================
    if (!isAdmin && "geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                // Success — fill hidden form fields and re-centre the map
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;

                const latInput = document.getElementById('lat');
                const lngInput = document.getElementById('lng');
                if (latInput) latInput.value = lat;
                if (lngInput) lngInput.value = lng;

                const locText = document.getElementById('location-text');
                if (locText) {
                    locText.innerHTML = "📍 <span class='text-green-600 font-medium'>Location Captured</span>";
                }

                // Fly the map to the user's exact location
                if (MapManager.map) MapManager.map.setView([lat, lng], 15);
            },
            (err) => {
                // Failed — tell the user so they can use "Adjust Location" manually
                console.warn("⚠️ Geolocation error:", err.message);
                const locText = document.getElementById('location-text');
                if (locText) {
                    locText.innerHTML = "⚠️ <span class='text-amber-600 font-medium'>Use 'Adjust Location' to set pin</span>";
                }
            }
        );
    }

    // ==========================================================
    // 3. LOAD ALL COMPLAINT PINS ONTO THE MAP
    // ==========================================================
    loadComplaints();

    // ==========================================================
    // 4. REPORT FORM — OPEN / CLOSE / DRAG
    // ==========================================================
    const toggleReportBtn = document.getElementById('toggle-report-btn');
    const reportCard      = document.getElementById('report-card');
    const closeFormBtn    = document.getElementById('close-form-btn');
    const dragHandle      = document.getElementById('drag-handle');

    if (toggleReportBtn && reportCard) {
        // Open the form card when FAB is clicked
        toggleReportBtn.onclick = () => {
            reportCard.classList.remove('hidden');
            toggleReportBtn.classList.add('hidden');
        };
    }

    if (closeFormBtn && reportCard) {
        // Close the form card, stop camera, exit marking mode
        closeFormBtn.onclick = () => {
            reportCard.classList.add('hidden');
            if (toggleReportBtn) toggleReportBtn.classList.remove('hidden');
            stopCamera(false);
            MapManager.clearMarkingMode();
            isMarkingMode = false;
        };
    }

    // Drag the report card around the screen (desktop only)
    if (dragHandle && reportCard) {
        let isDragging = false, offsetX = 0, offsetY = 0;

        dragHandle.addEventListener('mousedown', (e) => {
            isDragging = true;
            offsetX = e.clientX - reportCard.offsetLeft;
            offsetY = e.clientY - reportCard.offsetTop;
            e.preventDefault(); // Prevent text selection while dragging
        });

        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            reportCard.style.left      = `${e.clientX - offsetX}px`;
            reportCard.style.top       = `${e.clientY - offsetY}px`;
            reportCard.style.bottom    = 'auto';
            reportCard.style.transform = 'none';
        });

        document.addEventListener('mouseup', () => { isDragging = false; });
    }

    // ==========================================================
    // 5. CHAT WINDOW TOGGLE
    // ==========================================================
    const chatToggle = document.getElementById('chat-toggle');
    const chatWindow = document.getElementById('chat-window');

    if (chatToggle && chatWindow) {
        chatToggle.onclick = () => {
            const isHidden = chatWindow.classList.contains('hidden');
            if (isHidden) {
                chatWindow.classList.remove('hidden');
                chatWindow.classList.add('flex');
            } else {
                chatWindow.classList.add('hidden');
                chatWindow.classList.remove('flex');
            }
        };
    }

    // ==========================================================
    // 6. "ADJUST LOCATION" — TAP MAP TO PLACE A CUSTOM PIN
    // ==========================================================
    const markBtn = document.getElementById('toggle-marking-btn');

    if (markBtn) {
        markBtn.onclick = () => {
            isMarkingMode = !isMarkingMode;

            if (isMarkingMode) {
                // Enter marking mode — draw the blue accuracy zone
                const lat = parseFloat(document.getElementById('lat').value);
                const lng = parseFloat(document.getElementById('lng').value);

                markBtn.textContent = '✅ Done Marking';
                markBtn.classList.remove('text-teal-600');
                markBtn.classList.add('text-red-600');

                if (lat && lng) {
                    MapManager.drawAccuracyZone(lat, lng);
                    MapManager.map.flyTo([lat, lng], 17, { animate: true, duration: 1.2 });
                }
            } else {
                // Exit marking mode
                markBtn.textContent = '📍 Adjust Location';
                markBtn.classList.remove('text-red-600');
                markBtn.classList.add('text-teal-600');
                MapManager.clearMarkingMode();
            }
        };
    }

    // When user taps the map in marking mode, place pin at that spot
    if (MapManager.map) {
        MapManager.map.on('click', (e) => {
            if (!isMarkingMode) return;

            const { lat, lng } = e.latlng;
            MapManager.setPinpointMarker(lat, lng);

            // Update the hidden form fields with the manually chosen location
            const latInput = document.getElementById('lat');
            const lngInput = document.getElementById('lng');
            if (latInput) latInput.value = lat;
            if (lngInput) lngInput.value = lng;

            // Auto-exit marking mode after placing pin
            isMarkingMode = false;
            if (markBtn) {
                markBtn.textContent = '📍 Adjust Location';
                markBtn.classList.remove('text-red-600');
                markBtn.classList.add('text-teal-600');
            }
            MapManager.clearMarkingMode();
        });
    }

    // ==========================================================
    // 7. LIVE CAMERA SYSTEM
    // ==========================================================
    const video          = document.getElementById('camera-stream');
    const canvas         = document.getElementById('capture-canvas');
    const preview        = document.getElementById('photo-preview');
    const captureBtn     = document.getElementById('capture-btn');
    const retakeBtn      = document.getElementById('retake-btn');
    const closeCameraBtn = document.getElementById('close-camera-btn');
    const cameraOverlay  = document.getElementById('camera-overlay');
    const cameraControls = document.getElementById('camera-controls');

    /**
     * Opens the rear camera using the browser MediaDevices API.
     * facingMode: "environment" = rear camera on phones.
     * This ensures a LIVE photo — not a gallery upload.
     */
    async function startCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
                audio: false
            });
            localStream = stream;
            video.srcObject = stream;

            // Show the live video, hide the "tap to open" overlay
            cameraOverlay.classList.add('hidden');
            video.classList.remove('hidden');
            cameraControls.classList.remove('hidden');
            captureBtn.classList.remove('hidden');
            retakeBtn.classList.add('hidden');
            preview.classList.add('hidden');

        } catch (err) {
            console.error("❌ Camera error:", err);
            alert("Camera access denied or unavailable. Please allow camera access and try again.");
        }
    }

    /**
     * Stops all camera tracks (turns off the camera light on the phone).
     * @param {boolean} shouldKeepPreview - If true, keep the captured photo visible
     */
    function stopCamera(shouldKeepPreview = false) {
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            video.srcObject = null;
            localStream = null;
        }
        if (!shouldKeepPreview) {
            // Reset camera UI back to "tap to open" state
            if (video)          video.classList.add('hidden');
            if (cameraControls) cameraControls.classList.add('hidden');
            if (cameraOverlay)  cameraOverlay.classList.remove('hidden');
            if (preview)        preview.classList.add('hidden');
        }
    }

    // Tap the camera placeholder → open camera
    if (cameraOverlay) cameraOverlay.onclick = startCamera;

    // X button inside camera → close without keeping photo
    if (closeCameraBtn) closeCameraBtn.onclick = () => stopCamera(false);

    // Capture button → snapshot the video frame onto canvas, show as preview
    if (captureBtn) {
        captureBtn.onclick = () => {
            const ctx = canvas.getContext('2d');
            canvas.width  = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0); // Snapshot the current video frame

            // Show the captured photo in the preview img tag
            preview.src = canvas.toDataURL('image/jpeg');
            preview.classList.remove('hidden');

            // Hide live video, show retake button
            video.classList.add('hidden');
            captureBtn.classList.add('hidden');
            retakeBtn.classList.remove('hidden');

            // Stop the camera stream (turns off camera light)
            stopCamera(true); // true = keep the preview visible
        };
    }

    // Retake button → restart camera so user can take another shot
    if (retakeBtn) retakeBtn.onclick = startCamera;

    // ==========================================================
    // 8. COMPLAINT FORM SUBMISSION
    // This section handles:
    //  - Validation (location, description, photo)
    //  - Offline save to localStorage
    //  - Online POST to FastAPI with the live photo
    //  - Showing Gemini rejection message if photo is fake
    // ==========================================================
    const complaintForm = document.getElementById('complaint-form');

    if (complaintForm) {
        complaintForm.onsubmit = async (e) => {
            e.preventDefault(); // Stop the page from reloading

            // --- VALIDATION ---
            const lat         = document.getElementById('lat').value;
            const lng         = document.getElementById('lng').value;
            const description = document.getElementById('description').value.trim();

            if (!lat || !lng) {
                alert("📍 Location not captured yet. Please wait or use 'Adjust Location'.");
                return;
            }

            if (!description) {
                alert("📝 Please describe the road issue before submitting.");
                return;
            }

            // preview being hidden means no photo was taken yet
            if (!preview || preview.classList.contains('hidden')) {
                alert("📷 Please take a live photo of the issue first.");
                return;
            }

            // --- DISABLE SUBMIT BUTTON to prevent double-submit ---
            const submitBtn = complaintForm.querySelector('button[type="submit"]');
            if (submitBtn) {
                submitBtn.disabled    = true;
                submitBtn.textContent = '⏳ Verifying photo...';
            }

            // --- CONVERT CANVAS TO BLOB THEN SUBMIT ---
            // canvas.toBlob() is async — it encodes the image in the background
            canvas.toBlob(async (blob) => {
                if (!blob) {
                    alert("❌ Failed to process photo. Please retake.");
                    if (submitBtn) {
                        submitBtn.disabled    = false;
                        submitBtn.textContent = 'Submit Authentic Report';
                    }
                    return;
                }

                // Build FormData — this is what FastAPI receives
                const formData = new FormData();
                formData.append('lat',         lat);
                formData.append('lng',         lng);
                formData.append('description', description);
                // Wrap blob in a File so it has a proper filename
                formData.append('photo', new File([blob], 'live_capture.jpg', { type: 'image/jpeg' }));

                // --- OFFLINE CHECK ---
                // If no internet, save to localStorage and exit
                if (!navigator.onLine) {
                    Storage.saveComplaint({ lat, lng, description });
                    alert("📴 No internet — complaint saved offline.\nIt will auto-sync when you reconnect.");
                    if (submitBtn) {
                        submitBtn.disabled    = false;
                        submitBtn.textContent = 'Submit Authentic Report';
                    }
                    return;
                }

                // --- ONLINE: POST to FastAPI ---
                try {
                    // Update button to show it's talking to the server
                    if (submitBtn) submitBtn.textContent = '📡 Submitting...';

                    const res = await fetch('/complaint', {
                        method: 'POST',
                        body: formData
                        // IMPORTANT: Do NOT set Content-Type header manually.
                        // The browser sets it automatically with the correct
                        // multipart boundary string. Setting it manually breaks uploads.
                    });

                    const data = await res.json();

                    if (data.status === 'success') {
                        // ✅ SUCCESS — add pin to map and reset the form
                        alert("✅ Report submitted successfully! Thank you.");

                        // Add the new complaint pin to the map immediately
                        MapManager.addComplaintMarker({
                            lat:         parseFloat(lat),
                            lng:         parseFloat(lng),
                            photo_path:  '',
                            description: description,
                            timestamp:   new Date().toLocaleString()
                        }, false);

                        // Reset everything for the next complaint
                        complaintForm.reset();
                        stopCamera(false);
                        if (reportCard)      reportCard.classList.add('hidden');
                        if (toggleReportBtn) toggleReportBtn.classList.remove('hidden');

                    } else {
                        // ❌ FAILED — could be Gemini rejection or server error
                        // data.detail comes from FastAPI's HTTPException
                        // data.message comes from our own error returns
                        const errorMsg = data.detail || data.message || 'Submission failed. Please try again.';
                        alert(`❌ ${errorMsg}`);
                    }

                } catch (err) {
                    // Network error or server crash
                    console.error("❌ Fetch error:", err);
                    alert("❌ Could not reach the server. Make sure FastAPI is running on localhost:8000.");
                } finally {
                    // Always re-enable the submit button no matter what happened
                    if (submitBtn) {
                        submitBtn.disabled    = false;
                        submitBtn.textContent = 'Submit Authentic Report';
                    }
                }

            }, 'image/jpeg', 0.85); // 0.85 = 85% JPEG quality
        };
    }

    // ==========================================================
    // 9. AI CHATBOT — SEND MESSAGE
    // ==========================================================
    const sendChatBtn = document.getElementById('send-chat');
    const chatInput   = document.getElementById('chat-input');
    const chatMsgs    = document.getElementById('chat-messages');

    if (sendChatBtn && chatInput && chatMsgs) {
        // Send on button click
        sendChatBtn.onclick = sendChatMessage;

        // Also send on Enter key press (better UX)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendChatMessage();
        });
    }

    async function sendChatMessage() {
        const msg = chatInput.value.trim();
        if (!msg) return;

        // Show user's message on the right side
        chatMsgs.innerHTML += `
            <div class="bg-teal-100 p-3 rounded-lg rounded-tr-none text-slate-700 text-sm self-end ml-10">
                ${msg}
            </div>
        `;
        chatInput.value = '';
        chatMsgs.scrollTop = chatMsgs.scrollHeight;

        // Show typing indicator while waiting for AI response
        const typingId = `typing-${Date.now()}`;
        chatMsgs.innerHTML += `
            <div id="${typingId}" class="bg-slate-100 p-3 rounded-lg rounded-tl-none text-slate-500 text-sm mr-10 italic">
                AI is thinking...
            </div>
        `;
        chatMsgs.scrollTop = chatMsgs.scrollHeight;

        try {
            // POST the message to the /chat FastAPI endpoint
            const res  = await fetch(`/chat?message=${encodeURIComponent(msg)}`, { method: 'POST' });
            const data = await res.json();

            // Remove typing indicator and show real response
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            chatMsgs.innerHTML += `
                <div class="bg-slate-100 p-3 rounded-lg rounded-tl-none text-slate-700 text-sm mr-10">
                    ${data.response}
                </div>
            `;
        } catch (err) {
            const typingEl = document.getElementById(typingId);
            if (typingEl) typingEl.remove();

            chatMsgs.innerHTML += `
                <div class="bg-red-50 p-3 rounded-lg text-red-500 text-xs mr-10">
                    ❌ AI offline. Make sure the backend server is running.
                </div>
            `;
        }
        chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
});

// ==========================================================
// 10. LOAD COMPLAINTS ONTO MAP
// Called on page load for both citizen and admin pages.
// ==========================================================
async function loadComplaints() {
    try {
        const res = await fetch('/complaints');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        // Check which page we're on to decide marker colour
        const isAdmin = window.location.pathname.includes('admin');

        data.forEach(c => {
            MapManager.addComplaintMarker(c, isAdmin);
        });

        console.log(`📍 Loaded ${data.length} complaint(s) onto map.`);
    } catch (e) {
        console.error("❌ Failed to load complaints:", e);
    }
}
