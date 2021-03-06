// This is an array of Promise.resolve functions that will be called sequentially with delay
let throttled_resolvers = [];
// Number of milliseconds to wait before resolving the next queued promise
let PROMISE_INTERVAL = 1100;
// Number of milliseconds the promise might take to resolve
let PROMISE_MAX_TIME = 10000;
// Max number of promises to allow in the queue
let PROMISE_MAX_QUEUE = 100;
// Number of milliseconds to wait before rejecting the queued promise
let PROMISE_TIMEOUT = PROMISE_MAX_QUEUE * (PROMISE_INTERVAL + PROMISE_MAX_TIME);
// Number of milliseconds to wait for a tab to load
let TAB_TIMEOUT = 60000;
// List of items to persist between page loads
let global_list = {};


function handle_next_resolver() {
    let p = throttled_resolvers.shift();
    if (p === undefined) {
        setTimeout(handle_next_resolver, PROMISE_INTERVAL);
    }
    else {
        p.resolve();
    }
}

setTimeout(handle_next_resolver, PROMISE_INTERVAL);

function queue_promise() {
    return new Promise((resolve, reject) => {
        throttled_resolvers.push({ resolve: resolve });
        setTimeout(function () { reject(new Error("Queued promise has timed out.")); }, PROMISE_TIMEOUT);
    });
}

function check_if_tab_fully_loaded(tab) {

    function is_tab_complete(tab) {
        return tab.status === "complete" && tab.url !== "about:blank";
    }

    if (is_tab_complete(tab)) {
        return tab;
    } else {
        return new Promise((resolve, reject) => {

            const timer = setTimeout(
                function () {
                    browser.tabs.onUpdated.removeListener(on_updated);
                    if (is_tab_complete(tab)) {
                        resolve(tab);
                    } else {
                        reject(new Error("Tab status " + tab.status + ": " + tab.url));
                    }
                },
                TAB_TIMEOUT
            );
            
            function on_updated(tab_id, change_info, updated_tab) {
                if (tab_id == tab.id && is_tab_complete(updated_tab)) {
                    clearTimeout(timer);
                    browser.tabs.onUpdated.removeListener(on_updated);
                    resolve(updated_tab);
                }
            }

            browser.tabs.onUpdated.addListener(on_updated);

        });
    }
}

browser.runtime.onMessage.addListener(function(message, sender) {
    if (message.action_name === "close-this-tab") {
        browser.tabs.remove(sender.tab.id);
    }
    else if (message.action_name === "put-in-list") {
        /*
        Expected message format:
        {
            action_name: "put-in-list",
            action_payload: { item_id: "...", item: {...} }
        }
        */
        global_list[message.action_payload.item_id] = message.action_payload.item;
    }
    else if (message.action_name === "get-from-list") {
        /*
        Expected message format:
        {
            action_name: "get-from-list",
            action_payload: { item_id: "..." }
        }
        */
        console.log("get-from-list", message.action_payload.item_id, global_list[message.action_payload.item_id]);
        return new Promise((resolve, reject) => { resolve(global_list[message.action_payload.item_id]) });
    }
    else if (message.action_name === "bct-report") {
        if (throttled_resolvers.length >= PROMISE_MAX_QUEUE) {
            return new Promise((resolve, reject) => {
                reject(new Error("[WARNING] Try again later, queue limit reached: " + PROMISE_MAX_QUEUE));
            });
        }
        /*
        Expected message format:
        {
            action_name: "bct-report",
            action_url: "https://...",
            action_payload: { post_id: N, comment: "...", auto: true }
        }
        */
        let tab_url = message.action_url;
        let tab_action = "bct-tab-open-report";
        if (message.action_payload.auto) {
            tab_action = "bct-tab-submit-report";
            tab_url += ";a";
        }
        console.log(message);
        return queue_promise()
            .then(() =>
                browser.tabs.create({
                    url: tab_url,
                    windowId: sender.tab.windowId,
                    active: false
                })
            )
            .then((created_tab) => check_if_tab_fully_loaded(created_tab))
            .catch((error) => {
                error_message = "Tab load/check failed: " + error.message;
                console.log(error_message);
                throw new Error(error_message);
            })
            .then((loaded_tab) => browser.tabs.sendMessage(loaded_tab.id, { id: loaded_tab.id, action: tab_action, comment: message.action_payload.comment }))
            .then((tab_response) => {
                message.action_result = tab_response.result;
                return message;
            })
            .catch((error) => {
                console.log("Request failed in the background:");
                console.log(error);
                throw new Error(error.message);
            })
            .finally(() => {
                setTimeout(handle_next_resolver, PROMISE_INTERVAL);
            })
        ;
    }
});