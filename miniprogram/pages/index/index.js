Page({
  open(event) {
    const page = event.currentTarget.dataset.page || 'student';
    wx.navigateTo({
      url: '/pages/web/web?page=' + page
    });
  }
});
