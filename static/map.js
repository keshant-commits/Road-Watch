/**
 * map.js — MapManager
 *
 * All Leaflet.js logic lives here.
 * app.js calls MapManager.init(), MapManager.addComplaintMarker() etc.
 * Keeping map logic separate makes both files easier to read and debug.
 */

const MapManager = {
    map: null,             // The Leaflet map instance
    markers: [],           // All complaint markers on the map
    markerIndex: {},       // FIX: maps complaint ID → marker, so we can update them
    accuracyCircle: null,  // Blue circle shown in "Adjust Location" mode
    manualMarker: null,    // Red pin placed when user taps a custom location

    /**
     * Creates the Leaflet map inside the given HTML element.
     * Default center is Raipur, CG. GPS will recentre it once location is fetched.
     * @param {string} elementId - The id of the <div> to render the map in
     * @param {Array}  center    - [lat, lng] starting centre
     * @param {number} zoom      - Starting zoom level
     */
    init: function(elementId, center = [21.2514, 81.6296], zoom = 13) {
        try {
            this.map = L.map(elementId, {
                zoomControl: true,
                scrollWheelZoom: true
            }).setView(center, zoom);

            // OpenStreetMap tiles — free, no API key needed
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors',
                maxZoom: 19
            }).addTo(this.map);

            console.log(`🗺️ Map initialized on #${elementId}`);
        } catch (e) {
            console.error("❌ Map Init Error:", e);
        }
    },

    /**
     * Draws a blue translucent circle around a point.
     * Used in "Adjust Location" mode to show the GPS accuracy zone.
     */
    drawAccuracyZone: function(lat, lng) {
        // Remove old circle first if one already exists
        if (this.accuracyCircle) this.map.removeLayer(this.accuracyCircle);

        this.accuracyCircle = L.circle([lat, lng], {
            color: '#3b82f6',
            fillColor: '#3b82f6',
            fillOpacity: 0.15,
            radius: 100,   // 100 metre radius
            weight: 1
        }).addTo(this.map);
    },

    /**
     * Places a red custom location pin at the tapped coordinates.
     * Removes any previous manual marker first.
     */
    setPinpointMarker: function(lat, lng) {
        if (this.manualMarker) this.map.removeLayer(this.manualMarker);

        // Custom red Font Awesome location dot icon
        const customIcon = L.divIcon({
            className: 'fa-location-marker',
            html: '<i class="fa-solid fa-location-dot" style="color:#ef4444;font-size:28px;"></i>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]  // Anchor at bottom-centre of icon
        });

        this.manualMarker = L.marker([lat, lng], { icon: customIcon })
            .addTo(this.map)
            .bindPopup("<b style='color:#ef4444'>📍 Precise Location Set</b>")
            .openPopup();
    },

    /**
     * Removes the accuracy circle and the manual marker from the map.
     * Called when the user exits "Adjust Location" mode.
     */
    clearMarkingMode: function() {
        if (this.accuracyCircle) {
            this.map.removeLayer(this.accuracyCircle);
            this.accuracyCircle = null;
        }
        if (this.manualMarker) {
            this.map.removeLayer(this.manualMarker);
            this.manualMarker = null;
        }
    },

    /**
     * Adds a complaint pin to the map with a popup showing photo, description, status.
     * FIX: Now stores marker in markerIndex by complaint ID so status updates
     *      can refresh the popup without reloading the whole page.
     *
     * @param {Object}  complaint - A complaint object from the /complaints API
     * @param {boolean} isAdmin   - If true, uses a red marker (admin view)
     */
    addComplaintMarker: function(complaint, isAdmin = false) {
        try {
            // Build the popup HTML for this complaint
            const popupContent = this._buildPopup(complaint, isAdmin);

            // Admin map uses red markers, citizen map uses default blue
            const marker = isAdmin
                ? L.marker([complaint.lat, complaint.lng], {
                    icon: L.icon({
                        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png',
                        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
                        iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34]
                    })
                  })
                : L.marker([complaint.lat, complaint.lng]);

            marker.addTo(this.map).bindPopup(popupContent);

            // Store marker so we can update it later when status changes
            this.markers.push(marker);
            if (complaint.id) {
                this.markerIndex[complaint.id] = { marker, complaint };
            }

        } catch (e) {
            console.error("❌ Marker error:", e);
        }
    },

    /**
     * Builds the HTML string for a complaint popup.
     * Extracted into its own method so it can be reused when refreshing a popup.
     * @param {Object}  complaint
     * @param {boolean} isAdmin
     */
    _buildPopup: function(complaint, isAdmin) {
        // Only show photo if it's a real upload (not the sample placeholder)
        let photoHTML = '';
        if (complaint.photo_path && complaint.photo_path !== 'sample_placeholder') {
            const imgSrc = `/static/uploads/${complaint.photo_path}`;
            photoHTML = `
                <img src="${imgSrc}"
                     style="width:100%;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;"
                     onerror="this.style.display='none'">
            `;
        }

        // Status badge colours — matches the admin table badges
        const statusColours = {
            'Pending':          'background:#fef3c7;color:#92400e',
            'Work In Progress': 'background:#dbeafe;color:#1e40af',
            'Issue Fixed':      'background:#d1fae5;color:#065f46',
            'Dropped':          'background:#f1f5f9;color:#475569',
        };
        const statusStyle = statusColours[complaint.status] || 'background:#f1f5f9;color:#475569';
        const statusBadge = complaint.status
            ? `<span style="display:inline-block;padding:2px 8px;border-radius:999px;
                            font-size:11px;font-weight:600;${statusStyle}">
                   ${complaint.status}
               </span>`
            : '';

        return `
            <div style="min-width:200px;font-family:sans-serif;padding:4px;">
                ${photoHTML}
                <p style="font-size:13px;color:#334155;font-weight:600;margin:4px 0;">
                    ${complaint.description || 'No description'}
                </p>
                <p style="font-size:11px;color:#94a3b8;margin:4px 0;">
                    🕒 ${complaint.timestamp || ''}
                </p>
                <div style="margin-top:6px;">${statusBadge}</div>
            </div>
        `;
    },

    /**
     * FIX: Updates the popup content of an existing marker when its status changes.
     * Called by admin.js after a successful status update so the map stays in sync.
     * @param {number} complaintId - The ID of the complaint to refresh
     * @param {string} newStatus   - The new status string
     */
    updateMarkerStatus: function(complaintId, newStatus) {
        const entry = this.markerIndex[complaintId];
        if (!entry) return; // Marker not found — nothing to update

        // Update the stored complaint object with the new status
        entry.complaint.status = newStatus;

        // Rebuild the popup with the updated status badge
        const isAdmin = window.location.pathname.includes('admin');
        const newPopup = this._buildPopup(entry.complaint, isAdmin);
        entry.marker.setPopupContent(newPopup);

        console.log(`🗺️ Map marker #${complaintId} status updated to: ${newStatus}`);
    }
};