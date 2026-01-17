const modal = document.getElementById("annModal");
const openBtn = document.getElementById("openModal");
const closeBtn = document.getElementById("closeModal");
const annForm = document.getElementById('annForm');
const removeContainer = document.getElementById('removeImageContainer');
const removeCheck = document.getElementById('removeImageCheck');
let allAnnouncements = [];

// --- DROPDOWN LOGIC ---
function toggleMenu(menuId) {
    const selectedMenu = document.getElementById(menuId);
    if (selectedMenu) selectedMenu.classList.toggle("show");
}

// --- MODAL CONTROLS ---
if (openBtn) {
    openBtn.onclick = function() {
        annForm.reset(); 
        document.getElementById('editId').value = ''; 
        document.querySelector('.modal-content h2').innerText = "Add Announcement";
        removeContainer.style.display = "none";
        modal.style.display = "block";
    }
}

if (closeBtn) closeBtn.onclick = () => modal.style.display = "none";

window.onclick = (event) => { if (event.target == modal) modal.style.display = "none"; }

// --- CRUD OPERATIONS ---

// READ
async function loadAnnouncements() {
    const listElement = document.getElementById('announcement-list');
    if (!listElement) return;

    try {
        const response = await fetch('https://awards-central-philippines.onrender.com/announcements');
        allAnnouncements = await response.json();
        listElement.innerHTML = ''; 

        if (allAnnouncements.length === 0) {
            listElement.innerHTML = '<p style="text-align:center; color: #666;">No announcements yet.</p>';
            return;
        }

        // If Employee?
        const isAdmin = !window.location.pathname.includes('forEmployee.html');

        allAnnouncements.forEach((item, index) => {
            const li = document.createElement('li');
            li.className = "announcement-item";
            li.style = "background:#fff; border:2px solid #222222; border-radius:10px; padding:35px; margin-bottom:25px; list-style:none;";
            
            const imageDisplay = item.image_url 
                ? `<div style="margin: 20px 0; text-align: center;">
                    <img src="https://awards-central-philippines.onrender.com/uploads/${item.image_url}" 
                         style="max-width: 100%; max-height: 400px; border-radius: 10px; box-shadow: 0 4px 10px rgba(0,0,0,0);">
                   </div>` : '';
            
            // Generate Admin buttons only if on the admin index.html
            const adminButtons = isAdmin ? `
                <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:15px;">
                    <button onclick="prepareEdit(${index})" style="background:#444; color:white; border:none; padding:8px 15px; cursor:pointer; border-radius:4px;">Edit</button>
                    <button onclick="deleteAnn(${item.id})" style="background:#c40000; color:white; border:none; padding:8px 15px; cursor:pointer; border-radius:4px;">Delete</button>
                </div>` : '';
            
            li.innerHTML = `
                <h3 style="color:rgb(148,148,14); font-size:25px;">${item.title}</h3>
                <div style="color:#242424; line-height:1.6; padding:30px; box-shadow:0 4px 15px rgba(0,0,0,0.1); border-radius:10px; background:#fff;">
                    <p style="white-space:pre-wrap;">${item.content}</p>
                    ${imageDisplay}
                </div>
                ${adminButtons}`;

            listElement.appendChild(li);
        });
    } catch (error) {
        console.error("Load Error:", error);
    }
}

// CREATE & UPDATE
if (annForm) {
    annForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const id = document.getElementById('editId').value;
        const title = document.getElementById('annTitle').value;
        const content = document.getElementById('annContent').value;
        const imageFile = document.getElementById('annImage').files[0];
        const removeImage = removeCheck ? removeCheck.checked : false;
        const submitBtn = e.target.querySelector('button[type="submit"]');

        const url = id ? `https://awards-central-philippines.onrender.com/announcements/${id}` : 'https://awards-central-philippines.onrender.com/announcements';
        const originalText = submitBtn.innerText;
        
        submitBtn.innerText = id ? "Updating..." : "Posting...";
        submitBtn.disabled = true;

        try {
            const formData = new FormData();
            formData.append('title', title);
            formData.append('content', content);
            formData.append('removeImage', removeImage);
            if (imageFile) formData.append('image', imageFile);

            const response = await fetch(url, {
                method: id ? 'PUT' : 'POST', 
                body: formData  
            });

            if (response.ok) {
                alert(id ? "✅ Updated!" : "✅ Posted!");
                modal.style.display = "none";
                annForm.reset();
                loadAnnouncements();
            } else {
                const errData = await response.json();
                alert("Error: " + (errData.error || "Failed to save"));
            }
        } catch (error) {
            alert("❌ Connection Error");
        } finally {
            submitBtn.innerText = originalText;
            submitBtn.disabled = false;
        }
    });
}

// DELETE
window.deleteAnn = async function(id) {
    if (confirm("Delete this announcement? This will send a notification to staff.")) {
        try {
            const response = await fetch(`https://awards-central-philippines.onrender.com/announcements/${id}`, { method: 'DELETE' });
            if (response.ok) {
                alert("🗑️ Deleted!");
                loadAnnouncements();
            }
        } catch (error) { alert("❌ Connection error."); }
    }
}

// EDIT - Opens modal and populates data
window.prepareEdit = function(index) {
    const item = allAnnouncements[index];
    document.getElementById('editId').value = item.id;
    document.getElementById('annTitle').value = item.title;
    document.getElementById('annContent').value = item.content;
    
    // Show "remove image" option only if the post currently has an image
    removeCheck.checked = false;
    removeContainer.style.display = item.image_url ? "flex" : "none";
    
    document.querySelector('.modal-content h2').innerText = "Edit Announcement";
    modal.style.display = "block";
};

// SEARCH FUNCTIONALITY
function filterContent() {
    const filter = document.getElementById('searchInput').value.toLowerCase();
    const items = document.querySelectorAll('.announcement-item');
    items.forEach(item => {
        const text = item.innerText.toLowerCase();
        item.style.display = text.includes(filter) ? "" : "none";
    });
}

// EMAIL REGISTRATION LOGIC
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('staffEmail');
    const statusDiv = document.getElementById('emailStatus');
    const searchEmailBtn = document.getElementById('searchEmailBtn');
    const addEmailBtn = document.getElementById('addEmailBtn');

    if (searchEmailBtn) {
        searchEmailBtn.addEventListener('click', async () => {
            const email = emailInput.value;
            if (!email) return;
            try {
                const res = await fetch(`https://awards-central-philippines.onrender.com/emails/check/${encodeURIComponent(email)}`);
                const data = await res.json();
                statusDiv.innerText = data.exists ? `✅ Registered` : `❌ Not in system`;
                statusDiv.style.color = data.exists ? "#cccc4d" : "#ff4d4d";
            } catch (e) { statusDiv.innerText = "Server offline"; }
        });
    }

    if (addEmailBtn) {
        addEmailBtn.addEventListener('click', async () => {
            const email = emailInput.value;
            if (!email) return;
            try {
                const res = await fetch('https://awards-central-philippines.onrender.com/emails', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email })
                });
                if (res.ok) {
                    statusDiv.innerText = "🎉 Added!";
                    emailInput.value = "";
                }
            } catch (e) { statusDiv.innerText = "Connection failed"; }
        });
    }
});


loadAnnouncements();
