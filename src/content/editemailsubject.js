/*
 Copyright (C) 2011-2017 J-C Prin. (jisse44)

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>

    Modifications for TB78 by John Bieling (2020)
*/

var editEmailSubjectMain = {

	// open edit popup
	edit: async function (info) {
		this.msg = {};

		if (info.selectedMessages && info.selectedMessages.messages.length > 0) {
			let MessageHeader = info.selectedMessages.messages[0];
			this.msg.folder = MessageHeader.folder;
			this.msg.date = MessageHeader.date;
			this.msg.id = MessageHeader.id;
			this.msg.alreadyModified = false;


			// if the header contains X-EditIRT, we show a warning about being already modified
			let full = await messenger.messages.getFull(this.msg.id);
			this.msg.headers = full.headers;
			this.msg.alreadyModified = this.msg.headers.hasOwnProperty("x-editirt");
			this.msg.raw = await messenger.messages.getRaw(this.msg.id);

			messenger.runtime.onMessage.addListener(this.handleMessage);
			this.msg.popupWindow = await messenger.windows.create({
				height: this.msg.alreadyModified ? 260 : 170,
				width: 500,
				url: "/content/editemailsubjectPopup.html",
				type: "popup"
			});
		} else {
			console.log("No Message Selected!");
		}
	},

	// communication with popup window
	// this is called within global context
	handleMessage: function(request, sender, sendResponse) {
		if (request && request.action) {
			switch (request.action) {
				case "requestData":
					sendResponse(editEmailSubjectMain.msg);
				break;
				case "requestUpdate":
					if (request.newSubject != editEmailSubjectMain.msg.subject) {
						//change the entire email
						editEmailSubjectMain.updateMessage(request);
					}
				break;
			}
		}
	},



	// just update the subject value in the Thunderbird DB, do not change the actual email
	// it would be nice to be able to do this via messages.update(), but the newProperties obj does not have a subject member.
	updateSubject: function(request){
		messenger.MessageModification.setSubjectOfMessage(editEmailSubjectMain.msg.id, request.newSubject);
	},

	//change the entire email (add new + delete original)
	updateMessage: async function(request) {
		let raw = this.msg.raw
			.replace(/\r/g, "") //for RFC2822
			.replace(/\n/g, "\r\n");

		// extract the header section and include the linebreak belonging to the last header and include
		// a linebreak before the first header
		// prevent blank line into headers and binary attachments broken (thanks to Achim Czasch for fix)
		let headerEnd = raw.search(/\r\n\r\n/);
		let headers = "\r\n" + raw.substring(0, headerEnd+2).replace(/\r\r/,"\r");
		let body = raw.substring(headerEnd+2);

		// update in-reply-to, check if either is multiline
		while(headers.match(/\r\nIn-Reply-To: .*\r\n\s+/))
			headers = headers.replace(/(\r\nIn-Reply-To: .*)(\r\n\s+)/, "$1 ");
  // just remove references, otherwise we need to update that field too
		while(headers.match(/\r\nReferences: .*\r\n/))
			headers = headers.replace(/(\r\nReferences: .*)(\r\n\s+.*)*/, "");

		// either replace the in-reply-to header or add one if missing
		if (headers.includes("\nIn-Reply-To: ")) {
			headers = headers.replace(/\nIn-Reply-To: .*\r\n/, "\nIn-Reply-To: " + unescape(encodeURIComponent(request.newSubject)) + "\r\n");
		} else {
			headers += "In-Reply-To: " + unescape(encodeURIComponent(request.newSubject)) + "\r\n";
		}

		// Some IMAP provider (for ex. GMAIL) doesn't register changes in source if the main headers
		// are not different from an existing message. To work around this limit, the "Date" field is
		// modified, if necessary, adding a second to the time (or decreasing a second if second are 59)
		let mailAccount = await browser.accounts.get(this.msg.folder.accountId);
		if (mailAccount.type == "imap") {
			try {
				let date = this.msg.headers["date"][0].replace(/(\d{2}):(\d{2}):(\d{2})/, function (str, p1, p2, p3) {
					var seconds = parseInt(p3) + 1;
					if (seconds > 59) seconds = 58;
					if (seconds < 10) seconds = "0" + seconds.toString();
					return p1 + ":" + p2 + ":" + seconds});

				// update date
				headers = headers.replace(/\nDate: .*\r\n/, "\nDate: " + unescape(encodeURIComponent(date)) + "\r\n");
				headers = headers.replace(/\ndate: .*\r\n/, "\ndate: " + unescape(encodeURIComponent(date)) + "\r\n");
			} catch (e) {
				//silent catch
			}
		}

		// HACK: without changing the message-id, the MessageHeader obj of the new message and the old message will
		//share the same ID. It seems this was not the case in TB68.
		// Omigod why the evil?? NB: Need to fix thread after responding to mail, otherwise I break thread as well. :/
		headers = headers.replace(/\nMessage-ID: *.*\r\n/i, "\nMessage-ID: " + this.msg.headers["message-id"] + ".1\r\n");

		// update or modify X-EditEmailSubject headers
		let now = new Date;
		let EditEmailSubjectHead = ("X-EditIRT: " + now.toString()).replace(/\(.+\)/, "").substring(0,75);
		if (!headers.includes("\nX-EditIRT: ")) {
			headers += EditEmailSubjectHead + "\r\n";
		} else {
			headers = headers.replace(/\nX-EditIRT: .+\r\n/,"\n" + EditEmailSubjectHead + "\r\n");
		}

		//remove the leading linebreak;
		headers = headers.substring(2);

		let newID = await messenger.MessageModification.addRaw(headers + body, this.msg.folder, this.msg.id);
		if (newID) {
			console.log("EditIRT: Success [" + this.msg.id + " vs " + newID + "]");
			await messenger.MessageModification.selectMessage(newID);
			await messenger.messages.delete([this.msg.id], true);
		}
	}
};
