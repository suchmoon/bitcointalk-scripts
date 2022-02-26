/*
REPORT_SUBMIT_DELAY: number of milliseconds to wait before submitting the post report.

Mod report counts as post/PM for throttling - if you submit reports too quickly
the site will throw an error. One post/PM/mod report every four seconds is
typical throttling for high-ranked accounts, more details here:
https://bitcointalk.org/index.php?topic=237597.msg4131557#msg4131557
*/
let REPORT_SUBMIT_DELAY = 5000;

console.log("BCT-CONTENT initialized");
console.log("Page: " + window.location.href);
console.log("Referrer: " + document.referrer);

function process_background_message(message, sender, send_response) {
    browser.runtime.onMessage.removeListener(process_background_message);
    console.log("Content script received background message: " + JSON.stringify(message));
    if (message.action == "bct-tab-open-report" || message.action == "bct-tab-submit-report") {
        if (message.comment !== undefined) {
            document.getElementsByName("comment")[0].value = message.comment;
        }
        document.getElementsByName("comment")[0].focus();
        message.result = "OK";
    }
    if (message.action == "bct-tab-submit-report") {
        setTimeout(() => {
            send_response(message);
            // Uncomment the next line to allow reports to be submitted automatically
            //document.querySelector("input[type=submit][value=Submit]").click();
        }, REPORT_SUBMIT_DELAY);
    } else {
        send_response(message);
    }
    // this is needed to make the sender wait for a response
    return true;
}

function report_post(post_container, thread_id, post_id, report_comment, auto_submit) {
    post_container.classList.add("post-wait");

    let event_detail = {
        event_id: (Math.random().toString(36) + '000000000000000000').slice(2, 18),
        action_name: "bct-report",
        action_url: "https://bitcointalk.org/index.php?action=reporttm;topic=" + thread_id + ";msg=" + post_id,
        action_payload: { post_id: post_id, comment: report_comment, auto: auto_submit }
    };

    browser.runtime.sendMessage(event_detail)
        .then((message_response) => {
            //console.log("message_response: " + JSON.stringify(message_response));
            console.log("message_response size: " + JSON.stringify(message_response).length);
            post_container.classList.remove("post-wait", "post-error", "post-success");
            post_container.classList.add("post-success");
        })
        .catch((error) => {
            console.log("Data request failed:");
            console.log(error);
            post_container.classList.remove("post-wait", "post-error", "post-success");
            post_container.classList.add("post-error");
        })
    ;
    
}

function extract_ids_from_url(post_url) {
    let url_parts = post_url.split("#msg");
    let post_id = url_parts[1];
    let thread_id = url_parts[0].split(".msg")[0].split("?topic=")[1];
    return [thread_id, post_id];
}

function create_button(post_container, button_title, report_comment, text_field, auto_submit) {
    let button = document.createElement("button");
    button.className = "bct-report-button";
    button.innerText = button_title;
    button.title = report_comment;
    button.addEventListener("click", (e) => {
        e.preventDefault();
        if (text_field) {
            if (text_field.value.trim()) {
                report_comment += " " + text_field.value.trim();
            } else {
                alert("Required value missing");
                return;
            }
        }
        report_post(post_container, post_container.thread_id, post_container.post_id, report_comment, auto_submit);
    });
    return button;
}

function create_span(text) {
    let span = document.createElement("span");
    span.innerText = text;
    return span;
}

function create_text_field(hint) {
    let text_field = document.createElement("input");
    text_field.className = "bct-report-input";
    text_field.type = "text";
    text_field.placeholder = hint;
    return text_field;
}

function create_all_controls(button_container, post_container) {
    button_container.appendChild(create_span("Report as: "));
    button_container.appendChild(create_button(post_container, "zero value", "zero-value shitpost", null, true));
    button_container.appendChild(create_button(post_container, "multi post", "two or more consecutive posts in 24h", null, true));
    button_container.appendChild(create_button(post_container, "cross spam", "spamming their service across multiple threads - please check post history", null, true));
    button_container.appendChild(create_button(post_container, "non-english", "non-English post on English board", null, true));
    let url_field = create_text_field("URL of the original");
    button_container.appendChild(create_button(post_container, "copy from:", "copy-paste from:", url_field, true));
    button_container.appendChild(url_field);
    let board_field = create_text_field("correct board name");
    button_container.appendChild(create_button(post_container, "move to:", "wrong board, should be in", board_field, true));
    button_container.appendChild(board_field);
}

// inject the buttons into each message
document.querySelectorAll("div.post").forEach(post_container => {
    // Try to determine thread ID and post ID
    let link_object = null;
    if (post_container.parentNode.classList.contains("td_headerandpost")) {
        // Thread view
        // post -> td.td_headerandpost -> table ... -> div#subject_123456
        link_object = post_container.parentNode.firstElementChild.querySelector("div[id^='subject_'] a");
    } else {
        // Other views: patrol, user's post history, user's thread history
        let post_url_start = "https://bitcointalk.org/index.php?topic=";
        // post -> td -> tr -> tbody -> tr ... -> a[href contains #msg123456]
        link_object = post_container.parentNode.parentNode.parentNode.firstElementChild.querySelector("a[href^='" + post_url_start + "'][href*='#msg']");
    }
    if (link_object) {
        [post_container.thread_id, post_container.post_id] = extract_ids_from_url(link_object.getAttribute("href"));
        if (post_container.thread_id && post_container.post_id) {
            let button_container = document.createElement("div");
            button_container.className = "bct-report-button-container";
            post_container.appendChild(button_container);
            create_all_controls(button_container, post_container);
        } else {
            console.log("Found div.post and post URL but couldn't determine thread/post ID.");
        }
    } else {
        console.log("Found div.post but couldn't find post URL.");        
    }
});

if (window.location.href.startsWith("https://bitcointalk.org/index.php?action=reporttm")) {
    document.getElementsByName("comment")[0].style.width = "80%";
    browser.runtime.onMessage.addListener(process_background_message);
}

if (window.location.href.startsWith("https://bitcointalk.org/index.php?board=")) {
    if (document.referrer &&
        document.referrer.startsWith("https://bitcointalk.org/index.php?action=reporttm") &&
        document.referrer.endsWith(";a") // after automatic submission
    ) {
        console.log("Attempting to close this tab...");
        browser.runtime.sendMessage({ action_name: "close-this-tab" });
    }
}
