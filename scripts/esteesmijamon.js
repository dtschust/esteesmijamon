//Keyboard shortcut bindings
$(document).bind('keypress', 'k',function (evt){ 
        loadPrev();
    });
$(document).bind('keypress', 'j',function (evt){ 
        loadNext();
    });
$(document).bind('keypress', 'm',function (evt){ 
        var id = $('.feed_item_content.selected').parent().attr('id');
        toggleRead(id);
    });
$(document).bind('keypress', 's',function (evt){ 
        var id = $('.feed_item_content.selected').parent().attr('id');
        toggleStar(id);
    });
$(document).bind('keypress', 'i',function (evt){ 
        var id = $('.feed_item_content.selected').parent().attr('id');
        toggleReadLater(id);
    });
$(document).bind('keypress', 'o',function (evt){ 
	var href = $('.feed_item_content.selected').parent().find(".feed_item_menu a[target='_blank']").attr('href');
        if (href != null) { 
	  window.open(href,"_blank");
        }
    });

//Functions accessed via onclick events or keypresses
function loadPrev() {
  var oldId = $('.feed_item_content.selected').parent().attr('id');
  var newId = $('.feed_item_content.selected').parent().prev().attr('id');
  showHide(oldId);
  showHide(newId);
};

function loadNext() {
  var oldId = $('.feed_item_content.selected').parent().attr('id');
  var newId = $('.feed_item_content.selected').parent().next().attr('id');
  if (oldId == null) {
    var firstId = $('.feed_item').first().attr('id')
    showHide(firstId);
  } else {
    showHide(oldId);
    showHide(newId);
  }
};

function showHide(id){
  if (id == null) {
    return;
  }

  var contentElement = $("#"+id).find(".feed_item_content");
  var contentTitle = $("#"+id).find(".feed_item_title");
  var contentBar = $("#"+id).find(".feed_item_bar");

  if (contentElement.hasClass("hidden")) {
    /* Hide all */
    $(".feed_item_content").addClass("hidden").removeClass("selected");
    $(".feed_item_title").addClass("hidden").removeClass("selected");
    $(".feed_item_bar").addClass("hidden").removeClass("selected").removeClass("sticky");
    $('#content').unbind('scroll');
    contentElement.find("a").attr("target", "_blank");
    contentElement.removeClass("hidden").addClass("selected");
    contentTitle.removeClass("hidden").addClass("selected");
    contentBar.removeClass("hidden").addClass("selected");

    var $content = $('#content'),
        $stickyEl = $('.feed_item_bar.selected'),
        $stickyContent = $('.feed_item_content.selected');
    $content.scroll(function() {
        var stickyElTop = $stickyEl.offset().top;
        var stickyContentTop = $stickyContent.offset().top;
        var stickyContentHeight = $stickyContent.height();

        if ($stickyEl.hasClass('sticky')) {
          //TODO: Fix ugly hacky math here to make title bar of selected feed item stay at the top
          if (stickyElTop > 95 || stickyContentTop + stickyContentHeight + 25 < 95 || stickyContentTop > 119 ) {
            $stickyEl.removeClass('sticky');
            $stickyContent.removeClass('sticky');
          }
        } else {
          //TODO: Fix ugly hacky math here to make title bar of selected feed item stay at the top
          if (stickyElTop < 95 && stickyContentTop + stickyContentHeight - 25 > 95) {
            $stickyEl.addClass('sticky'); 
            $stickyContent.addClass('sticky');
          }
        }
    });

    var stickyElTop = $stickyEl.offset().top;
    console.log($stickyEl.offset().top + "," + $stickyEl.position().top);
    //TODO: Fix ugly hacky math here to make title bar of selected feed item stay at the top
    if (stickyElTop < 95 || $('.feed_item_content.selected:below-the-fold').length) {
      contentTitle[0].scrollIntoView(true);
     }
  } else {
    contentElement.removeClass("selected").removeClass("sticky").addClass("hidden");
    contentTitle.removeClass("selected").removeClass("sticky").addClass("hidden");
    contentBar.removeClass("selected").removeClass("sticky").addClass("hidden");
    $('#content').unbind('scroll');
  } 
};

function toggleRead(id){
  var access_token = document.getElementById("access_token").innerHTML;
  var param = "?read=";
  if ($("#"+id).find(".readIs_false").length == 1 ) {
    param += "true"; 
  } else {
    param += "false"; 
  }
  $.ajax({
    url: "/changeItemStatus/" + access_token + "/" + id + param,
    beforeSend: function ( xhr ) {
    }
  }).done(function ( data ) {
    if (data == "SUCCESS") {
      var feed_item_div = $("#"+id);
      if (feed_item_div.find(".readIs_false").length == 1 ) {
        feed_item_div.find(".readIs_false").addClass("readIs_true").removeClass("readIs_false");
        feed_item_div.find(".toggleRead")[0].innerHTML="○";
      } else {
        feed_item_div.find(".readIs_true").addClass("readIs_false").removeClass("readIs_true");
        feed_item_div.find(".toggleRead")[0].innerHTML="●";
      }
    }
  });
};


function addFeed() {
  var access_token = document.getElementById("access_token").innerHTML;
  var feedUrl = prompt("Enter a feed URL");
  if (feedUrl != null && feedUrl !== "") {
    feedUrl = encodeURIComponent(encodeURIComponent(feedUrl));
    $.ajax({
      url: "/addFeed/" + access_token + "/" + feedUrl,
      beforeSend: function ( xhr ) {
      }
    }).done(function ( data ) {
      if (data == "SUCCESS") {
        alert("Successfully added feed.  The new feed will show up in your feed list in a few minutes");
        $.ajax({
          url: "/updateFeedList/",
          beforeSend: function ( xhr ) {
          }
        }).done(function ( data ) {
          });
        }
    });
  }
}; 

function toggleStar(id){
  var access_token = document.getElementById("access_token").innerHTML;
  var param = "?starred=";
  if ($("#"+id).find(".starredIs_false").length == 1 ) {
    param += "true"; 
  } else {
    param += "false"; 
  }
  $.ajax({
    url: "/changeItemStatus/" + access_token + "/" + id + param,
    beforeSend: function ( xhr ) {
    }
  }).done(function ( data ) {
    if (data == "SUCCESS") {
      var feed_item_div = $("#"+id);
      if (feed_item_div.find(".starredIs_false").length == 1 ) {
        feed_item_div.find(".starredIs_false").addClass("starredIs_true").removeClass("starredIs_false");
        feed_item_div.find(".toggleStar")[0].innerHTML="★";
      } else {
        feed_item_div.find(".starredIs_true").addClass("starredIs_false").removeClass("starredIs_true");
        feed_item_div.find(".toggleStar")[0].innerHTML="☆";
      }
    }
  });
};

function toggleReadLater(id){
  var access_token = document.getElementById("access_token").innerHTML;
  var param = "?read_later=";
  if ($("#"+id).find(".readLaterIs_false").length == 1 ) {
    param += "true"; 
  } else {
    param += "false"; 
  }
  $.ajax({
    url: "/changeItemStatus/" + access_token + "/" + id + param,
    beforeSend: function ( xhr ) {
    }
  }).done(function ( data ) {
    if (data == "SUCCESS") {
      var feed_item_div = $("#"+id);
      if (feed_item_div.find(".readLaterIs_false").length == 1 ) {
        newNode = document.createElement('span');
        newNode.className = "readLaterIs_true";
        newNode.innerHTML = "✓";
	oldNode = feed_item_div.find(".toggleReadLater")[0];
        oldNode.parentNode.replaceChild(newNode, oldNode);
        if (feed_item_div.find(".readIs_false").length == 1 ) {
          feed_item_div.find(".readIs_false").addClass("readIs_true").removeClass("readIs_false");
          feed_item_div.find(".toggleRead")[0].innerHTML="○";
        }
      } else {
        feed_item_div.find(".readLaterIs_true").addClass("readLaterIs_false").removeClass("readLaterIs_true");
        feed_item_div.find(".toggleReadLater")[0].innerHTML='<img src="/images/read_later.png">';
      }
    }
  });
};

function toggleShowReadItems(sel) {
  var value = sel.options[sel.selectedIndex].value; 
  if (value == "All") {
    window.location.href = "./all";
  } else if (value == "Unread") {
    window.location.href = "./unread";
  }
};

function showHideKeyboardOverlay() {
  var overlay = $('div.keyboardShortcutsContainer');
  if (overlay.hasClass("hidden")) {
    overlay.removeClass("hidden");
  } else {
    overlay.addClass("hidden");
  }

};
