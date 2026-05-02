document.addEventListener("DOMContentLoaded", () => {
  const activitiesList = document.getElementById("activities-list");
  const activitySelect = document.getElementById("activity");
  const signupForm = document.getElementById("signup-form");
  const signupContainer = document.getElementById("signup-container");
  const messageDiv = document.getElementById("message");
  const authBtn = document.getElementById("auth-btn");
  const authUsername = document.getElementById("auth-username");

  // --- Auth state ---
  let authToken = localStorage.getItem("authToken");
  let loggedInUser = localStorage.getItem("authUser");

  function updateAuthUI() {
    if (authToken && loggedInUser) {
      authUsername.textContent = `\u{1F464} ${loggedInUser}`;
      authUsername.classList.remove("hidden");
      authBtn.textContent = "Logout";
      authBtn.onclick = handleLogout;
      signupContainer.classList.remove("hidden");
    } else {
      authUsername.textContent = "";
      authUsername.classList.add("hidden");
      authBtn.textContent = "\u{1F464} Login";
      authBtn.onclick = openLoginModal;
      signupContainer.classList.add("hidden");
    }
    fetchActivities();
  }

  // --- Login modal ---
  window.openLoginModal = function () {
    document.getElementById("login-modal").classList.remove("hidden");
    document.getElementById("modal-overlay").classList.remove("hidden");
    document.getElementById("login-username").focus();
  };

  window.closeLoginModal = function () {
    document.getElementById("login-modal").classList.add("hidden");
    document.getElementById("modal-overlay").classList.add("hidden");
    document.getElementById("login-error").classList.add("hidden");
    document.getElementById("login-form").reset();
  };

  document.getElementById("login-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    const errorDiv = document.getElementById("login-error");

    try {
      const response = await fetch(
        `/auth/login?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
        { method: "POST" }
      );
      const result = await response.json();

      if (response.ok) {
        authToken = result.token;
        loggedInUser = result.username;
        localStorage.setItem("authToken", authToken);
        localStorage.setItem("authUser", loggedInUser);
        closeLoginModal();
        updateAuthUI();
      } else {
        errorDiv.textContent = result.detail || "Login failed";
        errorDiv.classList.remove("hidden");
      }
    } catch {
      errorDiv.textContent = "Login failed. Please try again.";
      errorDiv.classList.remove("hidden");
    }
  });

  async function handleLogout() {
    try {
      await fetch("/auth/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${authToken}` },
      });
    } catch { /* ignore */ }
    authToken = null;
    loggedInUser = null;
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    updateAuthUI();
  }

  // --- Activities ---
  async function fetchActivities() {
    try {
      const response = await fetch("/activities");
      const activities = await response.json();

      activitiesList.innerHTML = "";
      // Reset select options
      activitySelect.innerHTML = '<option value="">-- Select an activity --</option>';

      Object.entries(activities).forEach(([name, details]) => {
        const activityCard = document.createElement("div");
        activityCard.className = "activity-card";

        const spotsLeft = details.max_participants - details.participants.length;

        const participantsHTML =
          details.participants.length > 0
            ? `<div class="participants-section">
              <h5>Participants:</h5>
              <ul class="participants-list">
                ${details.participants
                  .map(
                    (email) =>
                      `<li><span class="participant-email">${email}</span>${
                        authToken
                          ? `<button class="delete-btn" data-activity="${name}" data-email="${email}">&#10060;</button>`
                          : ""
                      }</li>`
                  )
                  .join("")}
              </ul>
            </div>`
            : `<p><em>No participants yet</em></p>`;

        activityCard.innerHTML = `
          <h4>${name}</h4>
          <p>${details.description}</p>
          <p><strong>Schedule:</strong> ${details.schedule}</p>
          <p><strong>Availability:</strong> ${spotsLeft} spots left</p>
          <div class="participants-container">
            ${participantsHTML}
          </div>
        `;

        activitiesList.appendChild(activityCard);

        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        activitySelect.appendChild(option);
      });

      if (authToken) {
        document.querySelectorAll(".delete-btn").forEach((button) => {
          button.addEventListener("click", handleUnregister);
        });
      }
    } catch (error) {
      activitiesList.innerHTML = "<p>Failed to load activities. Please try again later.</p>";
      console.error("Error fetching activities:", error);
    }
  }

  async function handleUnregister(event) {
    const button = event.target;
    const activity = button.getAttribute("data-activity");
    const email = button.getAttribute("data-email");

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/unregister?email=${encodeURIComponent(email)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");
      setTimeout(() => messageDiv.classList.add("hidden"), 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to unregister. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error unregistering:", error);
    }
  }

  signupForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email").value;
    const activity = document.getElementById("activity").value;

    try {
      const response = await fetch(
        `/activities/${encodeURIComponent(activity)}/signup?email=${encodeURIComponent(email)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );

      const result = await response.json();

      if (response.ok) {
        messageDiv.textContent = result.message;
        messageDiv.className = "success";
        signupForm.reset();
        fetchActivities();
      } else {
        messageDiv.textContent = result.detail || "An error occurred";
        messageDiv.className = "error";
      }

      messageDiv.classList.remove("hidden");
      setTimeout(() => messageDiv.classList.add("hidden"), 5000);
    } catch (error) {
      messageDiv.textContent = "Failed to sign up. Please try again.";
      messageDiv.className = "error";
      messageDiv.classList.remove("hidden");
      console.error("Error signing up:", error);
    }
  });

  // Validate stored token on load
  async function validateToken() {
    if (!authToken) {
      updateAuthUI();
      return;
    }
    try {
      const response = await fetch("/auth/status", {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      const result = await response.json();
      if (!result.logged_in) {
        authToken = null;
        loggedInUser = null;
        localStorage.removeItem("authToken");
        localStorage.removeItem("authUser");
      }
    } catch { /* ignore */ }
    updateAuthUI();
  }

  validateToken();
});
