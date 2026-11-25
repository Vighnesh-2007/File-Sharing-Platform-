const USERS_KEY = "fvUsers";
const SESSION_KEY = "fvCurrentUser";

// Get registered users
function getUsers() {
    try {
        return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
    } catch {
        return [];
    }
}

// Display message
function showMessage(id, message, type) {
    const element = document.getElementById(id);

    if (element) {
        element.textContent = message;
        element.className = "form-message " + type;
    }
}

// Password visibility
document.querySelectorAll(".show-pass").forEach(button => {
    button.addEventListener("click", function () {
        const input = document.getElementById(this.dataset.target);

        input.type = input.type === "password"
            ? "text"
            : "password";

        this.textContent = input.type === "password"
            ? "Show"
            : "Hide";
    });
});

// SIGNUP
const signupForm = document.getElementById("signupForm");

if (signupForm) {
    signupForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const name = document.getElementById("signupName").value.trim();
        const email = document.getElementById("signupEmail").value.trim().toLowerCase();
        const password = document.getElementById("signupPassword").value;
        const confirm = document.getElementById("confirmPassword").value;

        if (!name || !email || !password || !confirm) {
            showMessage("signupMessage", "Please fill all fields.", "error");
            return;
        }

        if (password.length < 6) {
            showMessage("signupMessage", "Password must have at least 6 characters.", "error");
            return;
        }

        if (password !== confirm) {
            showMessage("signupMessage", "Passwords do not match.", "error");
            return;
        }

        const users = getUsers();

        if (users.some(user => user.email === email)) {
            showMessage("signupMessage", "Email already registered. Please sign in.", "error");
            return;
        }

        users.push({
            id: Date.now().toString(),
            name: name,
            email: email,
            password: password
        });

        localStorage.setItem(USERS_KEY, JSON.stringify(users));

        showMessage("signupMessage", "Account created! Redirecting to login...", "success");

        setTimeout(() => {
            window.location.href = "./login.html";
        }, 1000);
    });
}

// LOGIN
const loginForm = document.getElementById("loginForm");

if (loginForm) {
    loginForm.addEventListener("submit", function (event) {
        event.preventDefault();

        const email = document.getElementById("loginEmail")
            .value.trim().toLowerCase();

        const password = document.getElementById("loginPassword").value;

        const users = getUsers();

        const user = users.find(
            item => item.email === email && item.password === password
        );

        if (!user) {
            showMessage("loginMessage", "Invalid email or password.", "error");
            return;
        }

        const session = {
            name: user.name,
            email: user.email
        };

        localStorage.setItem(
            SESSION_KEY,
            JSON.stringify(session)
        );

        showMessage("loginMessage", "Login successful! Opening dashboard...", "success");

        setTimeout(() => {
            window.location.href = "./index.html";
        }, 500);
    });
}